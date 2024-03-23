---
title: Detailed  Information About the MIT License
author: M shiva
tags: ["post", "featured"]
image: /assets/JWT-Cover.png
imageAlt: this is img alt
description: Detailed explaination of JWT authenticatiion with Passport
keyword: jwt, authentication, passportjs, nodejs
---

# Detailed explaination of JWT authenticatiion with Passport

JWT stands for JSON Web Tokens and it's a compact, URL-safe means of representing claims to be transferred between parties as a digital token.

## What are JSON Web Tokens?

JSON Web Tokens (JWT) are an open, standard method for securely transmitting information between parties as a JSON object. Three pillars
JSON Web Token (JWT) is an open standard (RFC 7519) that provides a compact way to express claims about the identity and authorization of users in a distributed system

information between parties as a JSON object. Three pillars make up the security of JWTs:
![alttext](/assets/What-is-JWT_.jpg)

1. **Encryption** - The payload of a token includes claims that represent the user's identity and permissions. These claims can be
1. **Portability** - The token can be stored in the HTTP header or included in URL query parameters. This allows developers to use any
1. **Encryption** - The token includes a signature that can be verified by anyone with the public key. This ensures that only those
1. **Encryption**: The data within the token is encrypted and can only be decrypted by those who have access to the secret key
1. **Encryption** - The token includes a signature that can be verified by anyone with access to a secret key. This ensures that
1. **Encryption** - The token includes a signature that can be verified by anyone with access to your secret key. This ensures that
1. **Encryption**: The payload of a token contains claims that represent the user's identity and other data. These claims are encoded
1. **Portability** - The token can be easily shared across different platforms and languages because it's based on JSON that is widely used
1. **Encryption** - The token includes a signature that can be verified by anyone with access to a secret key. This ensures that
1. **Encryption**: The payload of a token contains claims that represent the user's identity and other data. These claims are encoded
1. **Encryption** - The token includes a signature that can be verified by anyone with the public key. This ensures that only those
1. **Encryption** - The token includes a signature that can be verified by anyone with

```js
const a = "hello world";
console.log(a);
```
