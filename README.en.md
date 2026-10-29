# TagScope · RFID Tag Observatory

[中文](README.md) | **English**

TagScope is a web-based RFID reader test and tag observation tool whose UI and workflow follow Impinj ItemTest 2.x. It works with real readers or with a built-in simulator for demos. The project has no npm dependencies and only needs Node.js 18 or later.

> The interface is available in English and Chinese: use the **English / 中文** link at the bottom of the sidebar (the default follows your browser language).

## Online web app

URL: **[https://tagscope.iotrfid.top](https://tagscope.iotrfid.top)** (hosted on Cloudflare Workers)

- **Just try the UI**: choose "Simulated reader" when adding a data source. The simulator runs in the browser, so there is nothing to install.
- **Connect a real reader**: run `node server.js` on a computer on the same LAN as the reader, then add an LLRP or IoT interface data source in the web app and set "Bridge URL" to `http://localhost:8080` (the default).
- The first time the site contacts the local bridge, Chrome / Edge asks whether to allow it to access your local network / apps on this device; choose "Allow". Safari blocks https pages from calling local http services, so use Chrome, Edge or Firefox, or open <http://localhost:8080> directly.
- Tag data travels only between the browser and your local bridge, never through Cloudflare.
- The bridge only accepts cross-origin requests from local pages and the web app. To allow other origins, use `--allow-origin=https://example.com` (comma-separated for several).

Redeploy: `npx wrangler deploy` (configuration in `wrangler.toml`, entry point `worker.js`).

## Why a local bridge

Browsers cannot open TCP connections, so they cannot reach the reader's LLRP port (5084). `server.js` is a small local bridge that:

- serves the web UI (<http://localhost:8080>)
- talks to the reader over LLRP (TCP) or R700 REST (HTTPS)
- pushes tag data to the page in real time with Server-Sent Events

```
Browser ⇄ HTTP / SSE ⇄ server.js ⇄ LLRP TCP 5084 or HTTPS REST ⇄ Impinj reader
```

## Quick start

1. Install Node.js 18 or later (<https://nodejs.org>).
2. Start the bridge:
   - Windows: double-click `start-windows.bat`
   - macOS / Linux: run `./start.sh`, or `node server.js`
3. Open <http://localhost:8080>
4. Click "Data Sources ⊕" in the sidebar to add a reader (enter its IP or hostname and choose the interface), then click ▶ on the Inventory page to start.

See the **[English user guide](docs/user-guide-en.md)** for full instructions ([中文用户手册](docs/user-guide-zh.md)).

Common options: `node server.js --port=8080 --host=0.0.0.0 --verbose`

- `--host=0.0.0.0`: allow other computers on the LAN to connect. By default the bridge listens on localhost only.
- `--verbose`: print LLRP protocol details to the console.
- `--allow-origin=<origin>`: allow other web origins to call the bridge.

## Drivers

| Driver | Devices | Notes |
|---|---|---|
| LLRP | Speedway R120/R220/R420, xPortal, xArray/xSpan, and R700/R660 switched to LLRP mode | Most complete: inventory and all tag operations |
| R700 REST | R700/R660 running the IoT Device Interface | Inventory only. Default account root/impinj; self-signed certificates accepted |
| Simulator | No hardware needed | All data is simulated; the model is shown as "Simulated reader (not a real device)" |

## Features (compared with the ItemTest 2.14.1 user guide)

Version 2.0 follows the ItemTest 2.14.1 layout: the sidebar holds Displays / Data Sources / Tags of Interest / Settings, and the main area changes with the selection.

- **Data sources**: add several readers at once (LLRP, IoT/REST, simulator); a switch decides whether each takes part. Hover shows hostname/interface/model/region; right-click for "Edit data source / Device info"; "Retry" when unreachable. Advanced options: port, TLS, self-signed certificates, override default credentials.
- **Data source configuration** (click a source name): presets (default is read-only and is saved as a new preset when changed; the current preset is bold) with Refresh capabilities / Import / Export / Copy / Reset / Delete; manual settings (antennas, RF mode, search mode Single/Dual Target/TagFocus/Single Target Reset/Dual Target B→A, Fast ID, estimated tag population, session, phase angle/Doppler); power and sensitivity (global, max sensitivity, per antenna); GPI configuration (start/stop ports and levels); Gen2 filters (up to 5 Select filters with mask/bit length/offset/memory bank/match and non-match actions); low duty cycle. Diagnostics tab: GPO control, simulated GPI input (simulator), device info.
- **Inventory display**: ▶/■, stopwatch, gear for settings. List view columns match ItemTest (#, EPC, TID, XPC, read count, last read by, first/last read, since last read, reader time, tag model info (decoded from TID), RSSI last/avg/max/min, antenna, power, phase angle, Doppler, frequency, PC, CR Handle). Right-click a header to choose columns, drag headers to reorder, click to sort; rows fade to grey as time since last read grows. Right-click a tag: Tag memory access, Change EPC, EPC/TID/other columns hex ↔ Base64. Table view: data source × Tags of Interest file + Strays, with row/column swap and a summary.
- **Run scenarios**: continuous, timed (start delay/on time/off time/beep/number of runs), margin test (start/end power and step; the power column records the power at first read), GPI trigger (optionally reset the stopwatch on GPI start). Extras: unique tag chart, manual hex format, reset tags to state A before running (Single Target Reset, before the first or every run), read rate window.
- **Tag memory**: select one tag by EPC or TID; memory bank, word count (≤32), word offset, access password, set access password; 32 word boxes with two-way ASCII editing, copy to clipboard, status bar, Read / Write (optional BlockWrite), 5 s timeout; tag model shown at the top. Extension: lock / kill.
- **Tags of Interest**: ItemTest JSON (`{"Name","Version":"1.0.0","Tags":[{"Epc","Color"}]}`) and legacy CSV (`EPC,Color=<color>`); load several files and toggle each one; the badge shows the number of enabled tags. Files with a duplicate name are rejected, and a file with EPCs already in an enabled file cannot be enabled; click a file name for details.
- **Settings**: Updates (check the latest GitHub release, show web app and bridge versions), Tag Logging (automatically download a CSV after every run, with a header holding run time, readers and presets; optional unique tag log), About.
- **Interface language**: English / Chinese, switched from the bottom of the sidebar; the default follows the browser language.
- The Location / Direction displays require an xArray / xSpan gateway; only their entries are kept in this version.

## Notes

- A reader accepts only one LLRP client at a time. Close ItemTest, MultiReader and other software before connecting.
- On connect, the reader's LLRP configuration is reset to defaults, as ItemTest does.
- Kill and permalock cannot be undone. The UI asks for confirmation first.
- The R700 REST interface does not provide tag read/write; use the LLRP driver for tag operations.
- The 2.0 web app requires bridge 2.0 or later (multiple data sources). Download the bridge again if yours is older.
- Receive sensitivity in dBm is converted from the Impinj capability table: index 1 means maximum sensitivity and is shown as −80 dBm.

## File structure

```
server.js              Bridge (HTTP, SSE, API)
public/index.html      Web UI
public/i18n.js         Interface language (Chinese / English)
public/app.js          UI logic: backends, data sources, presets
public/views.js        UI logic: displays, tag memory, logging, navigation
public/sim.js          Simulated reader core (shared by browser and bridge)
public/tagdb.js        TID → tag model
docs/user-guide-en.md  English user guide
docs/user-guide-zh.md  Chinese user guide
lib/llrp-codec.js      LLRP 1.0.1 codec and Impinj extensions
lib/driver-llrp.js     LLRP driver
lib/driver-rest.js     R700 IoT Device Interface driver
lib/driver-sim.js      Simulator
test/                  Mock LLRP reader and end-to-end tests (npm test)
```

## Copyright

Copyright © 2026 Hill. All rights reserved.

Contact: Hill@iotrfid.top

Impinj, ItemTest, Speedway and xArray are trademarks of Impinj, Inc. TagScope is independently developed software and is not affiliated with Impinj.
