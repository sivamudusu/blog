---
title: HPC User Management with Bright Cluster Manager + Microsoft AD.
author: shiva
tags: ["post", "featured"]
image: "![image](https://github.com/user-attachments/assets/13b0ca28-600d-4d46-b4fb-f06b2182b582)"
imageAlt: HPC_User_Management
description: HPC User Management with Bright Cluster Manager + Microsoft AD
keywords: ["HPC User Management", "Bright Cluster Manager","Microsoft AD"]
---

### A Real-World Troubleshooting Guide

> **Environment:** Rocky Linux 8 (EL8), Bright Cluster Manager 9.2, Microsoft Active Directory, nslcd + sssd, PAM/LDAP auth stack


## The Problem

Users were added to Microsoft AD and given group memberships (including `docker`) but could **not login to HPC nodes**. Running `id <username>` on the node returned:

```
id: <username>: no such user
```

Old/existing users resolved fine. New users were completely invisible to the nodes.


## Step 1 — Identify the Auth Stack

Before fixing anything, figure out what's actually managing authentication on the nodes.

```bash
# Check name resolution order
cat /etc/nsswitch.conf | grep -E "passwd|group|shadow"

# Check running auth-related services
systemctl list-units --type=service --state=running | \
  grep -E "sssd|winbind|nslcd|pbis|ldap|centrify|quest|vas"

# Check installed packages
rpm -qa | grep -E "sssd|samba|winbind|pbis|ldap|nss|pam"

# Check PAM config
cat /etc/pam.d/system-auth
```

### What We Found

```
# nsswitch.conf
passwd:   files sss ldap systemd
shadow:   files sss ldap
group:    files sss ldap systemd

# Running services
nslcd.service   → Naming services LDAP client daemon
sssd.service    → System Security Services Daemon

# Key packages
sssd-common, sssd-client, sssd-kcm
nss-pam-ldapd
openldap, openldap-clients
cm-libpam, cm-config-ldap-client   ← Bright CM packages!
```

The presence of `cm-libpam` and `cm-config-ldap-client` confirmed this was a **Bright Cluster Manager** managed node. No `sssd.conf`, no Centrify — Bright manages its own internal OpenLDAP.

---

## Step 2 — Understanding Bright CM's Architecture

This is the **most important thing** to understand. Bright Cluster Manager runs its own internal OpenLDAP on the head node. The compute/app nodes authenticate against **Bright's LDAP**, not directly against Microsoft AD.

```
Microsoft AD                    Bright CM (Head Node)
(Source of Truth)               (Internal OpenLDAP)
      │                               │
      │   NO automatic sync ✗         │
      │                               │
   users/groups                  users/groups
   passwords                     passwords
   (AD UIDs/GIDs)                (separate copy, own UIDs)
```

**Adding a user in AD is NOT enough.** They must also exist in Bright's user database.

---

## Step 3 — Adding the User in Bright CM

Connect to the head node and use `cmsh`:

```bash
cmsh

# Navigate to user management
user

# List existing users
list

# Add new user
add <userid>
set commonname "common_name"
set homedirectory /home/users/<userid>
set shell /bin/bash
commit
```

> ⚠️ **Critical:** Do NOT let Bright auto-assign the UID. See Step 5 for why.

---

## Step 4 — Commit Error: LDAP Group Already Exists

When committing a new user, you may hit this error:

```
Field       Message
LDAP        Error: Error performing group ldap_add_ext_s: Already exists.
            New dn:cn=user_id,ou=Group,dc=cm,dc=cluster
user        Error: Unable to create a new group for a new user
```

**Why this happens:** A previous failed `add` + `commit` left an orphaned private group in Bright's LDAP.

### Fix — Remove the Orphaned Group

```bash
cmsh
group
show user_id      # confirm it exists

remove user_id
commit

# Now go back and commit the user
user
use user_id
commit
```

If the group doesn't appear in cmsh but the error persists, delete it directly from LDAP:

```bash
# Find the exact DN
ldapsearch -x -H ldap://localhost \
  -D "cn=cm-ldap-admin,dc=cm,dc=cluster" \
  -W -b "ou=Group,dc=cm,dc=cluster" \
  "(cn=user_id)" dn

# Delete it
ldapdelete -x -H ldap://localhost \
  -D "cn=cm-ldap-admin,dc=cm,dc=cluster" \
  -W "cn=user_id,ou=Group,dc=cm,dc=cluster"
```

> **Prevention:** Always use `cmsh → user → remove → commit` to cleanly remove users — never delete them any other way, or the private group becomes an orphan.

---

## Step 5 — UID Mismatch: 4-Digit vs Large Numbers

After adding the user, you may notice newly created users get small UIDs (1000, 1001, etc.) while AD users have large UIDs (like `658640604`).

**Why:**

| User Type | UID Source | Typical Range |
|---|---|---|
| AD/Centrify users | AD assigns uidNumber | 100000+ or 600000000+ |
| Bright-created users | Bright auto-increments | 1000, 1001, 1002... |

### Consequences of UID Mismatch
- NFS home directory access issues (files owned by wrong UID)
- Slurm job ownership problems
- File permission conflicts across nodes

### Fix — Always Set UID to Match AD

First find the user's actual AD UID:

```bash
# On a machine with AD/Centrify access
id user_id

# Or query AD directly
ldapsearch -H ldap://<AD-DC> \
  -D "binduser@yourdomain.com" \
  -W -b "DC=yourdomain,DC=com" \
  "(sAMAccountName=user_id)" uidNumber gidNumber
```

Then set it in Bright:

```bash
cmsh
user
use user_id
set uid <AD-UID-number>
set gid <AD-GID-number>
commit
```

Fix home directory ownership after UID change:

```bash
chown -R user_id:user_id /home/users/user_id
chmod 700 /home/users/user_id
chmod 700 /home/users/user_id/.ssh
chmod 600 /home/users/user_id/.ssh/authorized_keys 2>/dev/null
```

### Standard Procedure — Always Do This When Adding AD Users

```bash
cmsh
user
add <username>
set commonname "<Full Name>"
set homedirectory /home/users/<username>
set uid <UID-from-AD>        # ← ALWAYS set this explicitly
set gid <GID-from-AD>        # ← ALWAYS set this
set shell /bin/bash
commit
```

---

## Step 6 — Home Directory Already Exists Warning

When committing a user whose home dir already exists on the NFS share:

```
Field       Message
userName    Warning: The directory (/home/users/user_id) already exists,
            not overwriting it.
```

This is usually just a **warning, not a fatal error** — Bright skipped skel copy but the user was created. However the `.ssh` directory may have wrong ownership.

```bash
# Fix ownership
chown -R user_id:user_id /home/users/user_id
chmod 700 /home/users/user_id/.ssh
chmod 600 /home/users/user_id/.ssh/authorized_keys
```

---

## Step 7 — Adding Users to Groups (docker, etc.)

### Common Mistake
Being added to an AD group does NOT carry over to Bright. You must explicitly add the user to groups in Bright's own group database.

### Correct Command — `append members`

```bash
cmsh

# Method A — from group side
group
use docker
append members user_id
commit

# Method B — from user side
user
use user_id
append grouplist docker
commit
```

> ⚠️ **Note:** The command is `append members`, NOT `addmember` — a common confusion.

### Verify the Group Has the User

```bash
cmsh -c "group show docker"
# Should list user_id under members
```

---

## Step 8 — Syncing Groups to Nodes

After committing group changes in cmsh, nodes may still serve stale data.

### Force Sync to Node

```bash
# From head node
cmsh -c "device; use hpcapps; syncusers"

# If syncusers not available (newer Bright versions)
cmsh -c "device; use hpcapps; sync"
```

### Restart nslcd on the Node

```bash
# On hpcapps as root, or from head node
ssh root@hpcapps "systemctl restart nslcd && systemctl restart sssd"

# Verify immediately
ssh root@hpcapps "getent group docker"
# Should show: docker:x:<GID>:user_id
```

### If Group Shows Empty Members

```
docker:x:441:
```

This means the sync didn't push group members. The fix:

```bash
# Head node
cmsh -c "device; use hpcapps; syncusers"

# Node
ssh root@hpcapps "systemctl restart nslcd"

# Verify
ssh root@hpcapps "getent group docker"
# Should now show: docker:x:441:user_id
```

---

## Step 9 — Docker Permission Denied After Group Add

Even after adding to docker group in Bright, users may still get:

```
Got permission denied while trying to connect to the Docker daemon socket at
unix:///var/run/docker.sock
```

### Diagnosis

```bash
# Check user's current session groups
id
groups

# Check docker socket
ls -la /var/run/docker.sock
# Expected: srw-rw---- 1 root docker ...

# Check group on node
getent group docker
```

### Cause 1 — Session Not Refreshed

The most common cause. Old session doesn't have the new group.

```bash
# Quick fix without re-login
newgrp docker
docker ps -a

# Permanent fix
exit
ssh user_id@hpcapps
id    # docker should appear now
```

### Cause 2 — GID Mismatch Between Bright and Node

The docker socket on the node uses the **actual system GID** of the docker group. If you set a different GID in Bright (e.g. 1002) but the real docker GID on the node is 441, the socket won't be accessible.

```bash
# Check actual docker socket GID
ls -la /var/run/docker.sock       # note GID in output
getent group docker                # note GID here

# They MUST match
```

Fix in Bright:

```bash
# Get real GID from node
ssh root@hpcapps "getent group docker"
# docker:x:441:  ← real GID is 441

# Fix in cmsh
cmsh
group
use docker
set gid 441        # ← use the REAL GID from the node
commit

# Restart nslcd on node
ssh root@hpcapps "systemctl restart nslcd"

# User re-logs in and tests
docker ps -a
```

---

## Step 10 — Unknown Group ID Warning at Login

```
/usr/bin/id: cannot find name for group ID 658640604
```

This means the user belongs to an AD group (GID `658640604`) that **doesn't exist in Bright's LDAP**.

### Find the Group Name

```bash
ldapsearch -H ldap://<AD-DC> \
  -D "binduser@yourdomain.com" \
  -W -b "DC=yourdomain,DC=com" \
  "(gidNumber=658640604)" cn name
```

### Add Missing Group to Bright

```bash
cmsh
group
add <groupname>        # name from ldapsearch above
set gid 658640604      # must match AD GID exactly
commit
```

Check for all unresolved GIDs:

```bash
id user_id
# Look for any raw numeric GIDs — each one needs to be added to Bright
```

---

## Complete Workflow — Adding a New AD User to HPC Nodes

```bash
# 1. Get user details from AD
ldapsearch -H ldap://<AD-DC> -D "binduser@domain.com" -W \
  -b "DC=yourdomain,DC=com" \
  "(sAMAccountName=<username>)" uidNumber gidNumber cn

# 2. Add user in Bright with matching UID/GID
cmsh
user
add <username>
set commonname "<Full Name>"
set homedirectory /home/users/<username>
set uid <AD-UID>
set gid <AD-GID>
set shell /bin/bash
commit

# 3. Fix home directory ownership
chown -R <username>:<username> /home/users/<username>
chmod 700 /home/users/<username>

# 4. Add to required groups (docker, etc.)
cmsh
group
use docker
append members <username>
commit

# 5. Ensure docker GID matches the node's actual docker GID
getent group docker   # on the target node
cmsh -c "group show docker"   # compare GIDs

# 6. Sync to nodes
cmsh -c "device; use <nodename>; syncusers"
ssh root@<nodename> "systemctl restart nslcd"

# 7. Verify on node
ssh root@<nodename> "id <username>"
ssh root@<nodename> "getent group docker"

# 8. User logs in fresh and tests
ssh <username>@<nodename>
id
docker ps -a
```

---

## Root Cause Summary

| Issue | Root Cause | Fix |
|---|---|---|
| `id: no such user` | User not in Bright LDAP | Add via `cmsh → user → add` |
| LDAP group already exists | Orphaned group from failed commit | `cmsh → group → remove → commit` |
| Small UID assigned | Bright auto-increments its own counter | Always `set uid <AD-UID>` explicitly |
| `.ssh permission denied` | Home dir owned by wrong UID | `chown -R username /home/users/username` |
| docker group empty on node | cmsh changes not synced | `syncusers` + `systemctl restart nslcd` |
| docker permission denied | Stale session or GID mismatch | Re-login + verify GID matches socket |
| Unknown group ID at login | AD group missing from Bright | Add group with matching GID via cmsh |

---

## Why AD Group Membership Doesn't Auto-Sync

Bright CM's internal OpenLDAP and Microsoft AD are **completely independent systems**. Unless you configure explicit AD sync (via `cmsh → authentication`), every user and group must be manually mirrored in Bright.

```
Microsoft AD ──── no link ────→ Bright CM OpenLDAP
   uid: 658640001                  uid: 1001  ← wrong!
   gid: 658640604                  gid: 1002  ← wrong!
   groups: docker, hpc-users       groups: (empty)
```

### Long-Term Fix — Configure AD as Auth Source in Bright

```bash
cmsh
authentication
add ad_sync
set type activedirectory
set server <AD-DC-hostname>
set domain <yourdomain.com>
set binddn "CN=binduser,CN=Users,DC=yourdomain,DC=com"
set bindpassword <password>
set basedn "DC=yourdomain,DC=com"
commit
```

This makes AD the **single source of truth** — passwords, UIDs, group memberships all sync automatically.

---

## Key Commands Reference

```bash
# User management
cmsh -c "user list"
cmsh -c "user show <username>"
cmsh -c "user add <username>"

# Group management
cmsh -c "group list"
cmsh -c "group show docker"
cmsh -c "group; use docker; append members <username>; commit"

# Sync nodes
cmsh -c "device; use <nodename>; syncusers"
cmsh -c "device; foreach -t node * (syncusers)"

# Node-side verification
getent passwd <username>
getent group docker
id <username>

# Restart auth services on node
systemctl restart nslcd
systemctl restart sssd

# LDAP direct query
ldapsearch -x -H ldap://localhost \
  -D "cn=cm-ldap-admin,dc=cm,dc=cluster" \
  -W -b "ou=People,dc=cm,dc=cluster" "(uid=<username>)"
```

---

*This guide was built from real production troubleshooting on a BioMarin HPC environment running Bright Cluster Manager 9.2 on Rocky Linux 8 with Microsoft AD as the identity provider.*
