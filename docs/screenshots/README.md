# Portfolio screenshots

No presentation screenshots have been captured or committed here yet. This
directory is reserved for actual application captures, not mockups or generated
illustrations. Add README image embeds only after the corresponding files exist.

| Suggested filename | View to capture |
| --- | --- |
| `dashboard.png` | Overview with seeded healthy, HTTP-error, and delayed monitors; readable latest outcomes and freshness labels. |
| `monitor-history.png` | Selected monitor with response-time line, outcome strip, and recent history table. |

## Capture procedure

1. Follow the [root quick start](../../README.md#docker-compose-quick-start),
   then open the local frontend and hard-refresh the tab.
2. Wait for several worker checks and a dashboard refresh. Confirm displayed
   results match the intended scenario rather than changing labels or timestamps.
3. Capture the overview, then select **View history** for a monitor with HTTP
   responses and capture its chart/table. A delayed-only monitor shows timeout
   markers, not a fabricated latency line.
4. Use a readable viewport and consistent browser zoom. Exclude `.env`, terminal
   credentials, private target names, and other sensitive information from captures.
5. Save the actual PNGs here using the suggested filenames. Note the capture date
   and scenario below when files are added; provide descriptive alt text in any
   README embeds. An optional narrow-screen capture can demonstrate responsiveness.

Capture record: pending. Screenshots illustrate a moment in the running local
application; they are not proof of current uptime or a successful CI run.
