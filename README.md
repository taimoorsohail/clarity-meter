# clarity-meter

`clarity-meter` is a minimal Node.js web app for live scientific talks, seminars, and classes. Audience members open a phone webpage with a continuous clarity slider from "I'm lost" to "I'm with you". As they move the slider, their latest value is sent to the server automatically. The presenter keeps a separate control screen open and sees the live audience average update in real time.

The app is anonymous. It does not ask for names, emails, logins, or any personal information.

## What The App Does

- Serves an audience page with a large touch-friendly slider.
- Serves a presenter page with a live average, active response count, and large dot-on-track display.
- Keeps separate sessions using `?session=...` in the URL.
- Expires inactive audience responses after 15 seconds.
- Lets the presenter reset the meter without forcing audience phones to reload.
- Lets the presenter start a new checkpoint for a new slide or discussion segment.
- Stores simple checkpoint history in memory for the current server run.

## Requirements

- Node.js 18 or newer is recommended.
- `npm` must be available in your shell.
- For phone-based use, the audience devices must be able to reach the laptop running the server, usually over the same Wi-Fi network.

## Clone The Repository

```bash
git clone https://github.com/taimoorsohail/clarity-meter.git
cd clarity-meter
```

If you already downloaded the project another way, just change into the project directory before running the commands below.

## Install Dependencies

```bash
npm install
```

This installs the only runtime dependencies used by the app:

- `express`
- `socket.io`

## Run The App

```bash
npm start
```

By default the server starts on:

- `http://localhost:3000`

## Main URLs

Local presenter URL:

- `http://localhost:3000/presenter.html?session=demo`

Local audience URL:

- `http://localhost:3000/audience.html?session=demo`

You can replace `demo` with any session name you want, for example:

- `http://localhost:3000/presenter.html?session=ocean-talk`
- `http://localhost:3000/audience.html?session=ocean-talk`

If no session is provided, the app defaults to `demo`.

## Quick Local Test

1. Run `npm start`.
2. Open the presenter page in one browser window:
   `http://localhost:3000/presenter.html?session=demo`
3. Open the audience page in another browser window:
   `http://localhost:3000/audience.html?session=demo`
4. Move the audience slider.
5. Confirm the presenter page updates the average automatically.
6. Open extra audience tabs to confirm multiple responses contribute to the average.
7. Wait 15 seconds without sending new slider updates and confirm inactive responses disappear.
8. Click `Reset meter` and confirm the presenter page returns to `--` and `Active responses: 0`.
9. Click `New slide / checkpoint` and confirm the checkpoint number increments and the active responses clear.

## Using It In A Presentation Workflow

### Option 1: Run It Locally On Your Laptop For A Seminar Or Group Meeting

1. Clone the repo onto the laptop you will present from.
2. Run `npm install`.
3. Start the server with `npm start`.
4. Keep the presenter screen open on:
   `http://localhost:3000/presenter.html?session=my-talk`
5. Put the audience URL on a slide or convert it to a QR code:
   `http://YOUR_LOCAL_IP:3000/audience.html?session=my-talk`
6. Ask attendees to open that URL on their phones.
7. Keep the presenter page visible on your laptop or second monitor during the talk.
8. Use `Reset meter` when you want to clear the current live reading without changing slides.
9. Use `New slide / checkpoint` when you move to a new section, slide, or concept and want a fresh reading.

### Option 2: Use It On A Shared Local Network

1. Make sure the laptop and audience phones are on the same Wi-Fi network.
2. Find the laptop's local IP address.
3. Replace `YOUR_LOCAL_IP` in the audience link with that address.
4. Test with one phone before the talk begins.
5. Share only the audience URL publicly.
6. Keep the presenter URL limited to the presenter or host machine.

Example audience URL:

- `http://192.168.1.25:3000/audience.html?session=my-talk`

Example presenter URL on the laptop:

- `http://192.168.1.25:3000/presenter.html?session=my-talk`

### Option 3: Host It Publicly

If you need attendees outside your local network to join, host the app on a public server or platform that can run a Node.js process with WebSocket support. Then use the same audience and presenter paths with a public hostname.

## Finding Your Laptop's Local IP Address

Common examples:

- macOS: `ipconfig getifaddr en0`
- Linux: `hostname -I`
- Windows: `ipconfig`

Then build the audience URL like this:

- `http://YOUR_LOCAL_IP:3000/audience.html?session=my-talk`

## Presenter Workflow During A Talk

1. Start the server before the session begins.
2. Open the presenter URL and leave it open for the entire talk.
3. Share the audience URL or QR code at the start of the talk.
4. Watch the live percentage and response count while you explain material.
5. If the average drops below about 40%, treat that as a sign that the room may be losing the thread.
6. If the response count is low, interpret the signal cautiously.
7. Use `New slide / checkpoint` at major transitions so you can read each section separately.
8. Use `Reset meter` if you want to clear the current responses and wait for fresh input.

## Audience Behavior

- The audience page sends its slider value immediately on load.
- It sends updates whenever the slider moves.
- It resends its current value every 3 seconds so the response remains active.
- If the presenter starts a new checkpoint, the page stays open and usable.
- The slider does not jump when the presenter resets the session.

## Notes On Privacy And Security

- The app is anonymous.
- It does not collect names or email addresses.
- All state is stored only in memory.
- Checkpoint history disappears when the server restarts.
- Presenter-side controls are not strong security. This app is intended for local talks, seminars, classes, and small events where only the presenter receives the presenter URL.

## Project Structure

- `package.json`
- `server.js`
- `public/audience.html`
- `public/presenter.html`
- `public/style.css`
- `README.md`

## Development Notes

- No database is used.
- No build step is required.
- Static files are served from `public/`.
- Real-time updates are handled with Socket.IO.
