---
title: Enabling GPU Support for Docker on HPC with Bright Cluster Manager
author: HPC Infrastructure Team
date: 2026-05-21
tags: ["post", "featured"]
image: /assets/enabling-gpu-docker-hpc.png
imageAlt: enabling-gpu-docker-hpc-bright-cm
description: A step-by-step real-world troubleshooting guide to enabling NVIDIA GPU access inside Docker containers on an HPC cluster running Rocky Linux 8, Slurm, and Bright Cluster Manager — covering toolkit installation, driver upgrades, DKMS kernel mismatches, and baking all changes into the Bright software image for on-demand nodes.
keywords: [nvidia-container-toolkit, GPU, Docker, HPC, Slurm, Bright Cluster Manager, CUDA, DKMS, Rocky Linux, nvidia-driver]
---

# Enabling GPU Support for Docker on HPC with Bright Cluster Manager
### A Real-World Troubleshooting Guide

> **Environment:** Rocky Linux 8 (EL8), Bright Cluster Manager 9.2, Slurm with `cgpu` partition, NVIDIA GPUs, Docker

---

## The Problem

A user submitting jobs to the `cgpu` Slurm partition was spinning up Docker containers as part of their workload — but the containers had **no GPU access**. The node had GPUs, Slurm was allocating them correctly, but Docker had no idea they existed.

The fix required three things:
1. Installing and configuring **NVIDIA Container Toolkit**
2. Resolving a **driver version mismatch** between the host and the container image
3. **Baking all changes into the Bright CM software image** so on-demand nodes inherit the same config

---

## Environment

```
Cluster Manager : Bright Cluster Manager 9.2
OS              : Rocky Linux 8 (EL8)
Scheduler       : Slurm (partitions: defq, ccpu, cgpu)
GPU Node        : cgpunode001
Head Node       : us8hpc001aa
Driver (before) : 520.61.05 (CUDA 11.8)
Driver (after)  : 535.309.01 (CUDA 12.2)
```

---

## Step 1 — Verify the GPU is Accessible on the Node

Before touching Docker, confirm the node can actually see its GPUs:

```bash
nvidia-smi
```

If this fails, the NVIDIA driver itself isn't installed — fix that first. If it succeeds, you have a working driver but Docker doesn't know about it yet.

---

## Step 2 — Install NVIDIA Container Toolkit

This is the bridge between Docker and the NVIDIA driver on the host.

```bash
# Add the NVIDIA container toolkit repo
curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | \
  sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo

sudo dnf clean expire-cache
sudo dnf install -y nvidia-container-toolkit
```

### Pitfall: GitLab Runner Repo GPG Failure

The install will likely fail because of a broken GPG signature on an unrelated GitLab runner repo:

```
Error: Failed to download metadata for repo 'runner_gitlab-runner':
repomd.xml GPG signature verification error: Bad GPG signature
```

There is also a sibling repo `runner_gitlab-runner-source` that causes the same error. The fix is to disable both with a wildcard:

```bash
sudo dnf install -y nvidia-container-toolkit \
  --disablerepo="runner_gitlab-runner*"
```

To make this permanent so future `dnf` operations aren't blocked:

```bash
sudo sed -i 's/^enabled=1/enabled=0/' /etc/yum.repos.d/runner_gitlab-runner*.repo
```

> **Note:** This only disables the repo config file. The `gitlab-runner` service already installed on the node is completely unaffected.

---

## Step 3 — Configure Docker to Use the NVIDIA Runtime

After the toolkit is installed, configure Docker's daemon to use it:

```bash
# Write the nvidia runtime config to daemon.json
sudo nvidia-ctk runtime configure --runtime=docker

# Restart Docker to pick up the change
sudo systemctl restart docker

# Enable Docker to start on boot
sudo systemctl enable docker
```

Verify Docker registered the runtime:

```bash
docker info | grep -i runtime
# Expected: Runtimes: nvidia runc
```

Check what was written to `daemon.json`:

```bash
cat /etc/docker/daemon.json
# Expected:
# {
#     "runtimes": {
#         "nvidia": {
#             "args": [],
#             "path": "nvidia-container-runtime"
#         }
#     }
# }
```

---

## Step 4 — Test GPU Passthrough

At this point test whether Docker can actually see the GPU. The test image must match the host driver's maximum supported CUDA version.

```bash
# Check driver version and max supported CUDA
nvidia-smi | grep "Driver Version"
# Driver Version: 520.61.05   CUDA Version: 11.8
```

Use a matching image tag:

```bash
# Driver 520.x supports max CUDA 11.8
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

### Common Mistake: Wrong CUDA Image Version

Using a CUDA image that requires a newer driver than what's installed:

```
docker: Error response from daemon: failed to create shim task...
nvidia-container-cli: requirement error: unsatisfied condition: cuda>=12.2,
please update your driver to a newer version, or use an earlier cuda container
```

This error means the toolkit is working correctly — it's intercepting the container launch — but the image's minimum driver requirement is higher than what's installed. Either use a lower CUDA image version or upgrade the driver.

**CUDA image version → minimum driver required:**

| CUDA Image | Min Driver |
|---|---|
| 11.8 | 520.x |
| 12.0 | 525.x |
| 12.1 | 530.x |
| 12.2 | 535.x |
| 12.4 | 550.x |

---

## Step 5 — Upgrading the NVIDIA Driver (for CUDA 12.x Support)

If users need CUDA 12.x, the host driver must be upgraded from `520` to `535+`.

### The Bright CM Complication

Running `dnf module install nvidia-driver:535-dkms` directly on the node fails:

```
Problem: package cuda-driver-520.61.05-640_cm9.2.x86_64 conflicts with
nvidia-driver provided by nvidia-driver-3:535.309.01-1.el8.x86_64
```

The `_cm9.2` suffix reveals why: **Bright Cluster Manager installed and owns this driver package**. You cannot simply upgrade over it with a standard `dnf` command. The correct path is to modify the Bright software image.

### Drain the Node First

```bash
# From the head node — drain before any changes
scontrol update NodeName=cgpunode001 State=drain Reason="nvidia-driver-upgrade"
squeue -w cgpunode001   # wait until empty
```

### Chroot into the Bright Software Image

```bash
# On the head node
cm-chroot /cm/images/gpu-image

# Remove the Bright-managed old driver
dnf remove -y cuda-driver-520.61.05*

# Add CUDA repo
dnf config-manager --add-repo \
  https://developer.download.nvidia.com/compute/cuda/repos/rhel8/x86_64/cuda-rhel8.repo

# Disable the broken gitlab repo inside the image too
sed -i 's/^enabled=1/enabled=0/' /etc/yum.repos.d/runner_gitlab-runner*.repo 2>/dev/null

# Install driver 535
dnf module install -y nvidia-driver:535-dkms

# Install nvidia-container-toolkit inside image
dnf install -y nvidia-container-toolkit --disablerepo="runner_gitlab-runner*"

# Configure Docker nvidia runtime inside image
nvidia-ctk runtime configure --runtime=docker

# Enable Docker service inside image
systemctl enable docker

exit
```

---

## Step 6 — Resolving the DKMS Kernel Mismatch

After the driver upgrade and node reboot, `nvidia-smi` may fail with:

```
Failed to initialize NVML: Driver/library version mismatch
NVML library version: 535.309
```

Diagnosing this:

```bash
cat /proc/driver/nvidia/version
# NVRM version: NVIDIA UNIX x86_64 Kernel Module  520.61.05  ← old module still loaded!

modinfo nvidia | grep "^version"
# version: 520.61.05

dkms status
# nvidia/535.309.01, 4.18.0-425.3.1.el8.x86_64, x86_64: installed

uname -r
# 4.18.0-348.el8.0.2.x86_64
```

The root cause: DKMS compiled the 535 module for kernel `4.18.0-425` but the node is **booting kernel `4.18.0-348`**. The old 520 `.ko` files are still being loaded because no 535 module exists for the running kernel.

### Fix: Build DKMS for the Running Kernel

```bash
# Install kernel headers for the running kernel
dnf install -y kernel-devel-4.18.0-348.el8.0.2.x86_64

# Rebuild DKMS module for the correct kernel
dkms install nvidia/535.309.01 -k 4.18.0-348.el8.0.2.x86_64

# Verify
dkms status
# nvidia/535.309.01, 4.18.0-348.el8.0.2.x86_64, x86_64: installed
```

Then reload the modules without rebooting:

```bash
# Unload old modules in dependency order
rmmod nvidia_drm
rmmod nvidia_modeset
rmmod nvidia_uvm
rmmod nvidia

# Load new 535 modules
modprobe nvidia
modprobe nvidia_uvm
modprobe nvidia_modeset
modprobe nvidia_drm

# Verify
nvidia-smi
# Driver Version: 535.309.01   CUDA Version: 12.2
```

> **Why did DKMS build for the wrong kernel?** The chroot install ran inside the image which had headers for `4.18.0-425` (a newer kernel). The node was still booting `4.18.0-348` from Bright's provisioning. The two were out of sync.

### If rmmod Fails (Modules in Use)

```bash
systemctl stop docker
rmmod nvidia_drm nvidia_modeset nvidia_uvm nvidia
modprobe nvidia
systemctl start docker
```

---

## Step 7 — Final Validation

```bash
# 1. Confirm correct driver version
nvidia-smi | grep "Driver Version"
# Driver Version: 535.309.01   CUDA Version: 12.2

# 2. Confirm nvidia runtime registered
docker info | grep -i runtime
# Runtimes: nvidia runc

# 3. Test full GPU passthrough in container
docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi
# Should print GPU info from inside the container

# 4. Resume the node in Slurm
scontrol update NodeName=cgpunode001 State=resume
```

---

## Step 8 — Bake Into the Bright Image for On-Demand Nodes

This is the most critical step that's easy to miss. All the work done on the live node **does not automatically apply to new on-demand nodes**. New nodes provision from the Bright software image — if the image isn't updated, every new node will come up broken.

### What Lives Where

| Change | Where It Was Made | Persists to New Nodes? |
|---|---|---|
| `dnf install nvidia-driver:535` | cm-chroot (image) | ✅ Yes |
| `dnf install nvidia-container-toolkit` | cm-chroot (image) | ✅ Yes |
| `dkms install` for kernel 348 | Live node only | ❌ No |
| `nvidia-ctk runtime configure` | Live node only | ❌ No |
| `systemctl enable docker` | Live node only | ❌ No |

### Complete Image Fix

```bash
cm-chroot /cm/images/gpu-image

# Install kernel headers for the node's running kernel
dnf install -y kernel-devel-4.18.0-348.el8.0.2.x86_64

# Pre-build DKMS module for correct kernel
dkms install nvidia/535.309.01 -k 4.18.0-348.el8.0.2.x86_64

# Configure Docker nvidia runtime
nvidia-ctk runtime configure --runtime=docker

# Enable Docker on boot
systemctl enable docker

exit
```

### Verify the Image is Complete

```bash
chroot /cm/images/gpu-image rpm -qa | grep nvidia-driver
# nvidia-driver-3:535.309.01-1.el8 ✅

chroot /cm/images/gpu-image dkms status
# nvidia/535.309.01, 4.18.0-348.el8.0.2.x86_64: installed ✅

chroot /cm/images/gpu-image cat /etc/docker/daemon.json
# nvidia runtime config present ✅
```

### Sync to Existing Nodes

```bash
cmsh -c "device use cgpunode001; imageupdate; commit"
```

---

## User Job Script — Passing GPUs into Docker

With the setup complete, users must request GPUs in their Slurm job **and** pass them into the Docker container:

```bash
#!/bin/bash
#SBATCH --partition=cgpu
#SBATCH --gres=gpu:1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G

docker run --rm \
  --gpus "device=$CUDA_VISIBLE_DEVICES" \
  -v /scratch/$USER:/data \
  your-image:latest \
  python train.py
```

Slurm sets `CUDA_VISIBLE_DEVICES` to the specific GPU(s) allocated to the job. Passing it via `--gpus "device=$CUDA_VISIBLE_DEVICES"` ensures the container only sees the GPUs it was allocated — critical on multi-GPU nodes with multiple concurrent jobs.

---

## Key Commands Reference

```bash
# --- GPU Verification ---
nvidia-smi                                        # driver + GPU status
nvidia-smi | grep "Driver Version"               # driver version + CUDA ceiling
cat /proc/driver/nvidia/version                  # running kernel module version
modinfo nvidia | grep "^version"                 # installed module version
lsmod | grep nvidia                              # loaded modules

# --- DKMS ---
dkms status                                      # what's built and for which kernel
dkms install nvidia/<version> -k $(uname -r)    # build for running kernel
uname -r                                         # running kernel version

# --- Docker GPU ---
docker info | grep -i runtime                   # confirm nvidia runtime registered
nvidia-ctk runtime configure --runtime=docker   # write daemon.json
cat /etc/docker/daemon.json                     # verify config
nvidia-container-cli --load-kmods info          # test toolkit without pulling image

# --- DNF (Rocky Linux) ---
dnf list installed | grep -iE "nvidia|cuda"     # what's installed
dnf module list | grep nvidia                   # available driver module streams
dnf install ... --disablerepo="runner_gitlab-runner*"  # skip broken repo

# --- Slurm ---
scontrol update NodeName=<node> State=drain Reason="maintenance"
scontrol update NodeName=<node> State=resume
squeue -w <node>                                 # jobs on specific node

# --- Bright CM ---
cm-chroot /cm/images/gpu-image                  # enter image for modification
cmsh -c "device use <node>; imageupdate; commit" # push image to node
chroot /cm/images/gpu-image <command>           # run command against image without entering
```

---

## Lessons Learned

**1. Bright CM owns its driver packages.** The `_cm9.2` suffix on packages means Bright installed them. You cannot upgrade them directly with `dnf` — you must go through the software image.

**2. DKMS builds are kernel-specific.** A DKMS module built inside a chroot will target whatever kernel headers are present in the image — which may not match the kernel the node is actually booting.

**3. Live node changes are ephemeral in Bright.** Any change made directly on a compute node is lost on reprovisioning. The software image is the single source of truth.

**4. The GitLab runner GPG error is a red herring.** It has nothing to do with NVIDIA or Docker — it's just a stale GPG key on an unrelated repo that blocks all `dnf` operations until disabled.

**5. `could not select device driver` means `daemon.json` is missing or wrong.** The nvidia kernel module being loaded doesn't help if Docker doesn't know to use it. Always re-run `nvidia-ctk runtime configure` after any Docker reinstall or daemon reset.
