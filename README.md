# Antikythera Frontend

A React frontend for managing and monitoring blueprint execution.

## Prerequisites

- Node.js (v18 or later)
- Optional: The `antikythera` backend repository located in a sibling directory named `antikythera` (used as fallback if remote fetch fails).

## Installation

```bash
npm install
```

## Protocol Buffers

This project uses Protocol Buffers to communicate with the backend. The proto files and generated bundles are excluded from the repository to keep it slim.

To generate the necessary files:

```bash
npm run proto:update
```

The script will attempt to download `antikythera.proto` and `compas_pb` definitions from their respective GitHub repositories. If the `antikythera` repository is private, you can provide a `GITHUB_TOKEN` environment variable, or ensure the backend repository is checked out in a sibling directory named `antikythera` for a local fallback.

## Configuration

The API base URL is default set to `/api` in `src/App.tsx`. Update this if your backend runs on a different URL.

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```
