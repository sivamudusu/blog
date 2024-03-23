---
title: Setup LinkedIn Oauth with Easy Step by step process
author: shiva
tags: ["post", "featured"]
image: /assets/linkedin-oauth-main.png
imageAlt: linked in oauth alt
description: this is one of the easisets step by step process to setup linked oauth to your website
---

Setting up OAuth for LinkedIn involves several steps, including creating an application on the LinkedIn Developer portal, obtaining client credentials, configuring your application, and implementing OAuth flow in your code. Here's a step-by-step guide along with example code snippets:

## Step 2: Configure Your Application

Make sure to configure your application settings properly on the LinkedIn Developer portal. For example, set up redirect URLs, permissions, and other necessary configurations.

## Step 3: Implement OAuth Flow in Your Code

Here's a basic example of how to implement OAuth flow in a Node.js application using the passport-linkedin-oauth2 strategy:

1.  First, install necessary packages:

```bash
    npm install express passport passport-linkedin-oauth2 express-session

```

2.  Create an Express application and configure passport:

```js
const express = require("express");
const passport = require("passport");
const LinkedInStrategy = require("passport-linkedin-oauth2").Strategy;
const session = require("express-session");

const app = express();

app.use(
  session({ secret: "your-secret-key", resave: true, saveUninitialized: true })
);
app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new LinkedInStrategy(
    {
      clientID: LINKEDIN_CLIENT_ID,
      clientSecret: LINKEDIN_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/linkedin/callback",
      scope: ["r_emailaddress", "r_liteprofile"],
    },
    function (accessToken, refreshToken, profile, done) {
      // Store user data or perform other actions
      return done(null, profile);
    }
  )
);

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj);
});

app.get("/auth/linkedin", passport.authenticate("linkedin"));

app.get(
  "/auth/linkedin/callback",
  passport.authenticate("linkedin", { failureRedirect: "/login" }),
  function (req, res) {
    // Successful authentication, redirect home.
    res.redirect("/");
  }
);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
```

3. Make sure to replace LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET with your actual LinkedIn application credentials.

Start your server and navigate to http://localhost:3000/auth/linkedin to initiate the OAuth flow.

After successful authentication, LinkedIn will redirect back to your application with an access token. You can then use this token to make requests on behalf of the user.
