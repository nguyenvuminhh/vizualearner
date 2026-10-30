# Security and data handling

The downloaded app is a single-user local service, bound to loopback. Do not expose its app or visualization ports to the internet. The public website is static and does not run Codex, accept uploads, store conversations or call an AI provider.

The app invokes the user-installed Codex CLI. During AI generation, prompts, relevant source and attachments are sent through that user’s configured provider. Local workspaces and the user’s Codex configuration are not part of releases. Generated content runs in a sandboxed iframe on a separate local origin, with network access restricted by content security policy.

Report a suspected vulnerability to the maintainer using the contact information on [the maintainer’s profile](https://nguyenvuminh.duckdns.org/profile). Once this repository is published, prefer GitHub’s private vulnerability reporting if enabled. Do not post credentials, private projects or an exploitable proof of concept in a public issue.

This early release is provided as-is under the MIT license. Mathematical or financial correctness issues should be reported as product bugs and are separate from security vulnerabilities.
