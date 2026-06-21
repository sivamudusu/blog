Markdown
---
title: Turn a Spare Windows Laptop into a Private Server using WSL and Cloudflare Tunnels
author: shiva
date: 2026-06-21
tags: ["post", "featured"]
image: /assets/wsl-server-cloudflare.png
imageAlt: wsl-server-cloudflare
description: A complete, step-by-step guide to converting a spare Windows laptop into a globally accessible Linux server using WSL and Cloudflare Tunnels without opening router ports.
keywords: [wsl, cloudflare-tunnels, server, ssh, windows-subsystem-for-linux, home-lab]
---

# Detailed explanation of turning a spare Windows laptop into a private server using WSL

This guide walks you through transforming an old or spare Windows laptop into a fully functional, personal Linux server. By leveraging Windows Subsystem for Linux (WSL) and a persistent Cloudflare Tunnel, you will be able to securely SSH into your server from anywhere in the world—even from inside a Docker container on an external network—without dealing with complex router port-forwarding or dynamic IP headaches.

---

## Step 1: Configure the SSH Server inside WSL

First, we need to install and configure an OpenSSH server within your WSL distribution (e.g., Ubuntu) and switch it to a non-standard port to avoid conflicts with host Windows services.

- **Install OpenSSH Server:**
  Open your WSL terminal and update the package lists, then install the SSH server:
  ```shell
  sudo apt update && sudo apt upgrade -y
  sudo apt install openssh-server -y
  ```
- **Modify the SSH Configuration:**
  Open the configuration file to change the listening port to prevent Address already in use conflicts natively caused by Windows:

  ```Shell
  sudo nano /etc/ssh/sshd_config
  ```
  Find and update the following directives (remove the # comment character if present):

  ```Plaintext
  Port 2223
  PasswordAuthentication yes
  ListenAddress 0.0.0.0
  ```
  Save and exit (Ctrl+O, Enter, Ctrl+X).

- **Start and Verify the Service:**
  Launch the SSH service using administrative privileges:

  ```Shell
  sudo systemctl start ssh
  sudo systemctl status ssh
  ```
## Step 2: Point Domain Nameservers to Cloudflare
To get a clean, permanent address (like ssh.yourdomain.online), Cloudflare needs to manage your custom domain's DNS.

- **Add Site to Cloudflare:**
  Log into your Cloudflare Dashboard, click Add a Site, enter your domain name, and select the Free Plan. Cloudflare will provide you with two custom nameservers.

- **Update Registrar Settings:**
  Log into your domain provider (e.g., Namecheap), navigate to your main Domain settings page, find the Nameservers section, and switch the dropdown selection to Custom Nameservers.

  Paste the two Cloudflare nameservers into the boxes and click the save checkmark.

## Step 3: Create a Persistent Cloudflare Tunnel inside WSL
Instead of opening ports on your home router, we will use Cloudflare's lightweight daemon (cloudflared) to establish a secure, outbound-only link to the internet.

- **Install cloudflared in WSL:**
  Run the following commands in your WSL terminal to fetch and install the correct package:

  ```Shell
  curl -L [https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb) -o cloudflared.deb
  sudo dpkg -i cloudflared.deb
  rm cloudflared.deb
  ```
- **Authenticate the Tunnel CLI:**
  Link your local installation to your Cloudflare account:

  ```Shell
  cloudflared tunnel login
  ```
  Click the URL generated in the terminal, open it in your browser, and authorize access for your custom domain.

- **Create and Route the Tunnel:**
  Generate the unique cryptographic tunnel named wsl-server and bind a DNS routing record to it:

  ```Shell
  cloudflared tunnel create wsl-server
  cloudflared tunnel route dns wsl-server ssh.yourdomain.online
  ```
`Note the unique UUID string generated during the tunnel creation stage.`

## Step 4: Configure and Run the Tunnel Configuration
Creating a localized configuration file ensures your tunnel agent maps inbound domain traffic straight to your specific WSL internal port.

- **Create config.yml:**
  Create a configuration folder and open a new file:

  ```Shell
  mkdir -p ~/.cloudflared
  nano ~/.cloudflared/config.yml
  ```
  Populate the file with the following setup (replace YOUR-TUNNEL-UUID with your actual tunnel UUID identifier):

  ```YAML
  tunnel: YOUR-TUNNEL-UUID
  credentials-file: /home/shiva/.cloudflared/YOUR-TUNNEL-UUID.json

  ingress:
    - hostname: ssh.yourdomain.online
      service: ssh://localhost:2223
    - service: http_status:404
  ```
  Execute the Tunnel Connection:
  Fire up the secure pipeline:

  ```Shell
  cloudflared tunnel --config ~/.cloudflared/config.yml run wsl-server
  ```
## Step 5: Connect From an External Client (Docker Environment)
To securely connect to your home lab from an isolated environment—such as an ARM64/AMD64 Linux Docker container or a remote computer—you must proxy your connection safely back through Cloudflare.

- **Prepare cloudflared on the Client:**
  Inside your target remote client context (e.g., an ARM64 Linux container environment), install the matching system architecture application:

  ```Shell
  apt-get update && apt-get install -y curl ssh
  curl -L [https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb) -o cloudflared.deb
  dpkg -i cloudflared.deb
  rm cloudflared.deb
  ```
- **Establish the Remote SSH Session:**
  Initiate your SSH connection by using an inline ProxyCommand to bridge the protocol cleanly over Cloudflare:

  ```Shell
  ssh userId@localhost -o ProxyCommand="cloudflared access ssh --hostname ssh.yourdns.com
  ```
