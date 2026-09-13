<div align="center">

<a href="https://tryhangon.vercel.app"><img src="hangon-logo.png" width="96" alt="HangON logo"></a>

# HangON

### A voice front desk for clear requests and reliable follow up

HangON turns spoken requests into structured work that people can understand, confirm, track, and complete.

<p>
  <a href="https://tryhangon.vercel.app"><img src="https://img.shields.io/badge/Try%20the%20live%20demo-tryhangon.vercel.app-14532d?style=for-the-badge" alt="Try the live demo"></a>
  <a href="https://github.com/Datwebguy/hangON"><img src="https://img.shields.io/badge/Repository-GitHub-111827?style=for-the-badge&logo=github" alt="GitHub repository"></a>
</p>

<p>
  <img src="https://img.shields.io/badge/Node.js-20%2B-0f766e?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 20 or newer">
  <img src="https://img.shields.io/badge/JavaScript-ES%20modules-f59e0b?style=flat-square&logo=javascript&logoColor=111827" alt="JavaScript ES modules">
  <img src="https://img.shields.io/badge/Voice%20interface-Web%20Audio-2563eb?style=flat-square&logo=webaudio&logoColor=white" alt="Web Audio voice interface">
  <img src="https://img.shields.io/badge/Deployment-Vercel-111827?style=flat-square&logo=vercel&logoColor=white" alt="Vercel deployment">
</p>

</div>

<table>
  <tr>
    <td bgcolor="#e2f1eb"><strong>Product status</strong><br>Working prototype with a live demonstration, a protected request flow, and an operator workspace.</td>
    <td bgcolor="#fff4d6"><strong>Current storage</strong><br>Local JSON files keep the prototype easy to run. A managed database is recommended before production scale.</td>
    <td bgcolor="#e5edff"><strong>Primary audience</strong><br>Teams that receive repeated spoken requests and need a dependable path from conversation to action.</td>
  </tr>
</table>

## The idea

Important work often starts as an informal voice message, a rushed phone call, or a request that gets passed between people. The original meaning is easy to lose. Details become incomplete, ownership is unclear, and the person who made the request has no reliable way to know what happens next.

HangON is designed as a small, focused voice front desk for that gap. It gives a requester a natural way to explain what they need, turns the conversation into a structured request, and gives an operator a calm workspace for reviewing, confirming, and following up. The product is intentionally practical. It is not trying to replace a complete help desk or project management system. It is the dependable first step that makes the next step easier.

## What HangON does

The experience begins with a voice session in the browser. A requester can speak normally, clarify their need, and provide the context an operator will need. HangON keeps the conversation focused on useful information such as the requested action, the relevant details, the desired timing, and the best way to respond.

When the request is ready, the system creates a structured record with an identifier, a status, a timestamp, a transcript, and a sanitized set of request details. The operator can review the record in the workspace, open the full request history, and move the request through a simple lifecycle. The flow is designed to reduce ambiguity without forcing the requester to learn a complicated form before they can ask for help.

The project also includes a signed confirmation path for request updates and a webhook delivery path for integrations. These pieces make the prototype useful for evaluating a real workflow while keeping the boundaries between the browser, the application server, and external systems clear.

## How a request moves through the product

<table>
  <thead>
    <tr><th>Stage</th><th>Experience</th><th>Result</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Conversation</strong></td><td>The requester explains the need through the voice interface and can add context naturally.</td><td>A focused transcript and a clear intent.</td></tr>
    <tr><td><strong>Structuring</strong></td><td>The application turns the conversation into fields an operator can scan and verify.</td><td>A request record with an identifier and status.</td></tr>
    <tr><td><strong>Review</strong></td><td>The operator checks the details, confirms ownership, and decides the next action.</td><td>A request that is ready for follow up.</td></tr>
    <tr><td><strong>Follow up</strong></td><td>The request can be updated, acknowledged, or delivered to a configured integration.</td><td>A visible trail of progress instead of a lost message.</td></tr>
  </tbody>
</table>

## Architecture

HangON is a deliberately small JavaScript application. The browser owns the interaction layer and microphone experience. The Node.js server owns authentication checks, request creation, request updates, signed confirmation, workspace data, and integration delivery. The domain module keeps request rules and persistence decisions away from route handlers, which makes the core workflow easier to test and replace later.

```text
Browser interface
        │
        │ authenticated request
        ▼
Node.js application server
        │
        ├  Domain request workflow
        ├  Workspace and operator routes
        ├  Signed confirmation flow
        └  Webhook delivery boundary
        │
        ▼
Local JSON persistence for the prototype
```

The current implementation is intentionally honest about its maturity. Local JSON storage is useful for a portable prototype and makes the project simple to inspect, but it is not a substitute for durable multi user storage. A production version should move workspace state, requests, and delivery records to a managed database with proper concurrency control and an outbox or queue for reliable integration delivery.

## Security model

Security is treated as part of the workflow rather than an afterthought. Browser code does not receive an AssemblyAI API key. Voice sessions use a server minted temporary token when the relevant integration is configured, keeping the long lived secret on the server. Realtime sessions are explicitly terminated when the voice interaction ends.

The request API requires an authenticated bearer token, validates request shape and size, sanitizes stored details, and supports idempotent creation through a client supplied request key. Confirmation links are signed and time limited. Integration secrets are encrypted at rest with the master key stored outside the browser. The application also rejects unsafe webhook destinations rather than allowing arbitrary server side requests.

<table>
  <thead>
    <tr><th>Boundary</th><th>Protection</th></tr>
  </thead>
  <tbody>
    <tr><td>Browser to server</td><td>Bearer authentication, request validation, bounded payloads, and explicit error responses.</td></tr>
    <tr><td>Voice provider</td><td>Temporary server minted sessions with no provider secret in browser code.</td></tr>
    <tr><td>Request creation</td><td>Sanitized details, idempotent request keys, generated identifiers, and controlled state transitions.</td></tr>
    <tr><td>Confirmation</td><td>Signed, expiring confirmation data that cannot be modified by changing a URL parameter.</td></tr>
    <tr><td>External delivery</td><td>Encrypted integration secrets and validation of outbound destinations.</td></tr>
  </tbody>
</table>

## Technology choices

The interface uses plain HTML, CSS, and browser JavaScript so the core experience remains portable and easy to inspect. The server uses Node.js with native ES modules and a small HTTP surface. The voice experience uses the Web Audio APIs together with the selected speech provider integration. The prototype uses local files for persistence so a new contributor can run the project without provisioning a database before understanding the product.

<table>
  <thead>
    <tr><th>Layer</th><th>Choice</th><th>Reason</th></tr>
  </thead>
  <tbody>
    <tr><td>Interface</td><td>HTML, CSS, browser JavaScript</td><td>Fast to load, easy to review, and suitable for a focused prototype.</td></tr>
    <tr><td>Application</td><td>Node.js native HTTP server</td><td>Small operational surface with direct control over authentication and request boundaries.</td></tr>
    <tr><td>Domain</td><td>Dedicated request module</td><td>Business rules stay testable and independent from the transport layer.</td></tr>
    <tr><td>Voice</td><td>Web Audio with server minted provider sessions</td><td>Natural input without exposing long lived provider credentials.</td></tr>
    <tr><td>Persistence</td><td>Local JSON files for evaluation</td><td>Portable setup today, with a clear path to managed storage later.</td></tr>
    <tr><td>Deployment</td><td>Vercel serverless deployment</td><td>Simple preview and demonstration hosting for the current prototype.</td></tr>
  </tbody>
</table>

## Run HangON locally

HangON requires Node.js 20 or newer. From the project directory, install the project dependencies and start the server.

```powershell
npm install
npm start
```

Open `http://localhost:3000` in a browser. The application can run in local evaluation mode with the default project files. Copy `.env.example` to `.env` when you need to configure authentication, the voice provider, encryption, or integration behavior. Keep `.env` local and never commit it.

The local server uses the files under `data` for prototype persistence. The integration master key and request records are intentionally ignored by Git. If you need a clean local evaluation, remove those generated records manually after stopping the server and allow the application to create them again.

## Configuration

The configuration surface is intentionally small. Authentication values protect the request and operator routes. AssemblyAI values enable the server minted voice session. The integration master key protects stored integration credentials. Workspace settings control the operator experience and can be supplied through the supported environment variables described in `.env.example`.

Production deployments should provide secrets through the hosting platform rather than through committed files. The live demonstration at `https://tryhangon.vercel.app` is a product preview. Its operator and provider capabilities remain intentionally unavailable when production secrets have not been configured, which is safer than silently running an unauthenticated workflow.

## Verify the project

The test suite covers the request domain, authentication behavior, idempotent creation, sanitized storage, and signed confirmation behavior. Run the tests with the project command below.

```powershell
$env:NODE_OPTIONS = "--test-isolation=none"
npm test
```

The server files can also be checked directly with Node.js.

```powershell
node --check server.mjs
node --check live.js
```

The `demo-video` directory contains the Remotion source for the product walkthrough. Generated narration, intermediate renders, and the final local video are ignored so a source checkout remains lightweight. The visual composition can be rendered with the project video command after the local narration asset has been created.

## HTTP surface

The application exposes a deliberately small set of routes. The public pages serve the requester and operator experiences. The API creates and reads requests, checks authentication, manages workspace data, creates temporary voice sessions, and handles signed confirmation. Exact route behavior and validation live in `server.mjs` and the domain request module, which are the authoritative implementation references.

<table>
  <thead>
    <tr><th>Area</th><th>Purpose</th></tr>
  </thead>
  <tbody>
    <tr><td>Public interface</td><td>Requester voice flow, landing experience, product assets, and operator workspace shell.</td></tr>
    <tr><td>Request API</td><td>Create, retrieve, and update structured requests with authentication and validation.</td></tr>
    <tr><td>Session API</td><td>Mint temporary voice provider sessions from the protected server boundary.</td></tr>
    <tr><td>Confirmation API</td><td>Verify signed confirmation data and apply the supported request action.</td></tr>
    <tr><td>Integration API</td><td>Store and use configured delivery destinations without exposing secrets to the browser.</td></tr>
  </tbody>
</table>

## Repository hygiene

The public repository is kept focused on the application, its tests, its deployment configuration, and the reusable source for the product demo. Private agent notes, local setup notes, generated narration, request records, integration keys, environment files, Vercel state, and dependency folders are excluded through `.gitignore` and `.vercelignore`. The public `README.md` is the only project documentation intended for GitHub.

Please do not commit credentials, request data, provider tokens, local recordings, or generated deployment state. If a secret is ever exposed, revoke it first and then remove it from the relevant history. A clean repository is part of the product’s trust model.

## Roadmap

The next meaningful step is durable multi tenant storage with a managed database, explicit operator identity, and a reliable delivery outbox. That foundation would allow HangON to support concurrent workspaces without relying on local files. The following step is a stronger integration layer with retry visibility, delivery history, and provider specific adapters.

The product can then expand its request intelligence carefully. Useful additions include better extraction of urgency and ownership, clearer consent around recordings, accessibility improvements for keyboard and screen reader users, and analytics that measure request completion rather than vanity activity. The guiding principle is simple: every feature should make the handoff from human conversation to accountable work clearer.

## Contributing

Contributions are welcome when they improve the request lifecycle, preserve the security boundaries, or make the local experience easier to understand. Before opening a change, run the test suite, inspect the public file list, and confirm that no environment file, key, request record, generated media, or private note is included. Small changes with clear explanations are easiest to review and safest to ship.

## License

No open source license has been declared yet. Until a license is added to the repository, treat the source as available for evaluation only and ask the maintainers before redistributing or using it in another product.

<div align="center">

<br>

<table>
  <tr><td bgcolor="#14532d"><font color="#ffffff"><strong>HangON turns “I need help with this” into a request that can be owned, understood, and completed.</strong></font></td></tr>
</table>

<p><a href="https://tryhangon.vercel.app">Open the live demo</a> · <a href="https://github.com/Datwebguy/hangON">View the source</a></p>

</div>
