# SnapBooth prototype

## Run it on this computer

1. Double-click `start-local.bat`.
2. SnapBooth opens at `http://127.0.0.1:8000/`.
3. Keep the terminal window open while using the prototype. Press `Ctrl+C` there to stop it.

The server prints a `Phone preview` address for each local network connection. Open that address on a phone connected to the same Wi-Fi as the computer. Allow camera access when prompted. If Windows Firewall asks, allow access on private networks so the phone can connect.

The prototype stays on this computer and local Wi-Fi. This does not publish the site or push any files to GitHub. Gallery photos are stored in each browser, so photos saved on one device do not automatically appear on the other.

## AI assistant

The booth works without an AI key and can answer common SnapBooth questions. To enable general AI answers during local testing, the server can prompt for an OpenAI API key when it starts. The key is held in memory for that session and is not written into the project. Do not share the key with testers.

## Share beyond the same Wi-Fi

For testers on a different network, use a private HTTPS preview service or a deployed preview site. Do not expose the local server directly to the public internet.
