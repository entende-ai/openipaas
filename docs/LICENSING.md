# Licensing

Open IpaaS is released under the [Apache License 2.0](../LICENSE).

This page explains what that means in practice, and why it was chosen. It is not
legal advice.

## What you can do

Apache 2.0 is a permissive license. You may:

- **Use it commercially.** Run it in production, charge your customers.
- **Modify it.** Fork it, change it, keep the changes private.
- **Distribute it.** Ship it inside your own product.
- **Self host it.** For your company, or for your clients.
- **Sublicense it.** Include it in software under a different license.

You do not owe us anything, and you do not have to open source your changes.

## What you must do

Only two things, and both only when you redistribute:

1. **Keep the notices.** Include the `LICENSE` and `NOTICE` files, and preserve
   existing copyright and attribution notices.
2. **State changes.** Mark files you modified as changed.

If you are just running Open IpaaS, even as a paid service to your own
customers, neither obligation is triggered. Running is not distributing.

## The patent grant

This is the practical difference between Apache 2.0 and MIT, and the reason we
chose it.

Apache 2.0 includes an **express patent license** from every contributor: anyone
who contributes code also grants you the right to use any patents that code
needs. It also has a retaliation clause, so a contributor who sues you over
patents in this software loses their own grant.

MIT is silent on patents. That silence is what makes some corporate legal
departments slow to approve a dependency. Apache 2.0 removes the question, which
matters for a project whose users are companies integrating business critical
systems.

## Why not a restrictive license

We considered the n8n and Sentry style approach, a source available license that
forbids offering the software as a competing service. We chose against it, for
reasons specific to this project:

**The code is not the moat.** For an integration platform, the durable value is
in keeping dozens of connectors working: tokens refreshing, upstream contract
changes absorbed, uptime maintained. Anyone can clone the code. Almost nobody
wants the operational burden. That is different from a database or a workflow
engine, where the product genuinely is the binary.

**Our scarce resource is contributors, not protection.** The goal is the largest
catalog of integrations in the world. That only happens if contributing is
frictionless, and a non OSI license adds friction exactly where we can least
afford it. Restricting now would optimize against a problem we do not have yet,
at the cost of the one thing we actually need.

**Adoption compounds.** Apache 2.0 goes into a corporate dependency review
without an argument. A source available license usually does not.

## Keeping the option open

Relicensing later requires owning the copyright to the whole codebase. The
moment a contribution is merged from someone who has not assigned or certified
their rights, that becomes impossible in practice.

This is why every commit must carry a
[DCO sign off](../CONTRIBUTING.md#license-and-the-dco). It records provenance for
each contribution, keeps the licensing unambiguous, and preserves the project's
ability to make a different choice in the future if it ever needs to.

## If we ever build a paid product

The likely shape is **open core**: this repository stays Apache 2.0 in full,
and commercial features live separately under their own terms. Candidates are
the things large organizations pay for and individuals do not need, such as SSO,
fine grained role based access control, audit logging and long term retention.

Nothing that exists in this repository today would move behind that line.
Whatever is Apache 2.0 stays Apache 2.0.

## Applying the header to new files

New source files do not need a license header. The `LICENSE` file at the root
covers the repository, which is standard for a single license project.

If your employer requires per file headers, the boilerplate is at the end of the
`LICENSE` file.

## Third party code

Dependencies keep their own licenses. If you add a dependency under a copyleft
license such as GPL or AGPL, raise it in the pull request first: it can impose
obligations on everyone who redistributes Open IpaaS.
