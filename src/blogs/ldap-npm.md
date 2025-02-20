---
title: Setup LDAP Auth for a privte NPM registry step by step process.
author: shiva
tags: ["post", "featured"]
image: /assets/npmo-auth-ldap.png
imageAlt: npm-auth-ldap
description: this is one of the easisets step by step process to setup linked oauth to your website
keywords: [verdaccio, authentication, verdaccio-ldap, LDAP]
---
# Detailed explaination of Settimg LDAP authentication for a private npm reistry

## Step1 : Run Verdaccio in Docker
- create docker-compose.yml file
create a file named docker-compose.yml with the following content
```yml
    version: '3.8'
    services : 
        verdaccio : 
            image : verdaccio/verdaccio
            container_name : npm
            labels:
                port : 4873
                description : description
                security : LDAP
            volumes:
                - ./storage: /verdaccio/storage
                - ./conf: /verdaccio/conf
            restrat : alsways

```
- prepare the directories
create the following directories
```yml
    - config(for verdaccio)
    - storage(to store packages and metadata)
```

- start the container
Run the following command
```shell
    docker compose up -d
```
## step2 : Configure Verdaccio
- create config.yml
create a file named config.yml inside the config directory with the following content
```yml
    auth:
        htpasswd:
            file: /verdaccio/conf/htpasswd
            max_users : -1
    packages:
        '@your-org/*':
            acess : $all
            publish : $all
            proxy : npmjs
        '*/*':
            access : $all
            publish: $all
            proxy : npmjs

```
- @your-org/* scope allows anyone(trusted via reverse proxy) to access and publish
- No authentiction is configures within the verdaccio

## step 3 : End User configuration
- update .npmrc
Add the following lines to ~/.npmrc
```bash
    registry=https://registry.npmjs.org
    @your-org:registry=https://your-org.npm
    //https://your-org.npm/:_auth=<username:passwd(base64 encoded)>
    email=your-email
    always-auth=true

```

## step 4 : publish a package
 Example pakage.json
 ```json
{
    "name":"@yur-org/name",
    "version":"0.0.1",
}
 ```
## step 5 : Install packages
- To install packages from your private registry 
```bash
    npm i @your-org/component-name
```
will download compoents from your registry
```bash
    npm i component-name
```
will download components from default npm registry
