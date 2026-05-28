module.exports = {
  apps: [
    {
      name: "urlala-server",
      exec_mode: "fork",
      instances: "1",
      script: "./dist/main.js",
      autorestart: true,
    },
  ],
}
