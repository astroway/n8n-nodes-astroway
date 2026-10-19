# @astroway/n8n-nodes-astroway

An [n8n](https://n8n.io) community node for the [AstroWay astrology API](https://api.astroway.info). Natal charts, synastry, transits, Vedic, Human Design, BaZi, numerology, tarot and more, as ready-made actions instead of hand-built HTTP requests.

[![npm version](https://img.shields.io/npm/v/@astroway/n8n-nodes-astroway.svg?style=flat&color=blue)](https://www.npmjs.com/package/@astroway/n8n-nodes-astroway)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Install

In n8n open **Settings → Community Nodes → Install**, enter `@astroway/n8n-nodes-astroway` and confirm. Self-hosted n8n can also install it with `npm install @astroway/n8n-nodes-astroway` in `~/.n8n/nodes`.

## Credentials

1. Sign in at [api.astroway.info/dashboard](https://api.astroway.info/dashboard/) and create a key on the Keys page. The Free plan works.
2. In n8n create an **AstroWay API** credential and paste the key. n8n checks it with `GET /v1/auth/keys/me`, which spends no credits. If the key has an endpoint scope, add `auth/keys/me` to it, or the check says `Forbidden` even though calls inside the scope work.

Every call spends credits from the key owner's account; the price of each endpoint is in the [API reference](https://api.astroway.info/en/docs/api/).

## Usage

1. Add the **AstroWay** node, or search the node panel for the calculation, for example "Natal Chart".
2. Pick a **Resource** (a group such as Core, Vedic or Human Design) and an **Operation**.
3. Under **Fields** the required fields are already listed; add optional ones with **Add field**. Object fields such as `chart1` in Synastry take JSON.
4. Run the node. The output is the `data` part of the API answer; a list comes back as `{ "items": [...] }`.

A natal chart needs `date` (`YYYY-MM-DD`), `latitude` and `longitude`, plus `time` (`HH:MM`) and a `timezone` such as `Europe/Kyiv`. Add `fields` with comma-separated paths, for example `planets.name,planets.longitude`, to keep only what the next node needs.

Errors keep the API's code and message, for example `INVALID_INPUT` with the list of fields that failed. With **Settings → On Error → Continue** the error lands on the item instead of stopping the workflow.

[`examples/natal-chart.json`](examples/natal-chart.json) is a workflow you can import: a manual trigger and one natal chart.

## AI Agent tool

The node can be attached to an n8n AI Agent as a tool. Pick the operation the agent may call and let the model fill the fields with the "Let the model define this parameter" button next to each one.

## Operations

730 operations in 52 groups, generated from the live [OpenAPI document](https://api.astroway.info/v1/openapi.json): Core, Aspects & Points, Prognostics, Horoscope, Vedic (175), Human Design, BaZi, Zi Wei Dou Shu, Chinese zodiac and feng shui, Hellenistic (four traditions), Horary, Astro-Geography, numerology in five systems, tarot (Rider-Waite-Smith, Marseille, Lenormand), runes, I Ching, Mayan calendars, Kabbalah, Destiny Matrix, reports, visualization and reference data.

Field forms are read from the same OpenAPI document when you open the node, so a field added to the API appears without a node update. Embeddable HTML widgets, streaming routes and key management are not part of the node.

## Links

- [API documentation](https://api.astroway.info/en/)
- [No-code integrations](https://api.astroway.info/en/integrations/)
- [Status](https://api.astroway.info/en/status/)

## License

MIT
