# Contributing a skill

Add a skill under `skills/<skill-id>/` following the [Agent Skills specification](https://agentskills.io/specification), then validate it before opening a pull request. Local checks require Node.js 22 or later and `npm ci` from the repository root.

## 1. Create the skill directory

Use a lowercase kebab-case identifier. The directory and the `name` in `SKILL.md` must match.

```text
skills/example-skill/
├── SKILL.md
├── LICENSE
├── references/   # optional
├── scripts/      # optional
└── assets/       # optional
```

`SKILL.md` needs `name` and `description` frontmatter. Keep the main instructions focused and place detailed material in the optional support directories.

```markdown
---
name: example-skill
description: Performs the example workflow. Use when the user asks for an example result.
---

# Example skill

Follow the accepted task contract and return observable evidence.
```

The name is 1–64 lowercase letters, digits, and hyphens, with no leading, trailing, or consecutive hyphens. The description is 1–1024 characters and explains both the task and when to use the skill. Optional `compatibility` text must be 1–500 characters; optional `metadata` maps string keys to string values.

Use `references/` for detailed instructions the agent needs only for particular tasks, `scripts/` for executable helpers, and `assets/` for templates or other output resources. Link references from `SKILL.md` using paths relative to the skill root and explain when to read them. Keep the entrypoint concise; the specification recommends fewer than 500 lines and avoiding deeply nested reference chains. A reference is part of the skill and may contain technical instructions needed to perform its task.

Keep each skill usable on its own: include its supporting files and document script dependencies. Leave repository maintenance procedures and changelogs out of skill/plugin content.

Every published skill includes its own `LICENSE` because the skill can be distributed without a plugin wrapper.

## 2. Catalog the skill

Add its ID to `marketplace.json`:

```json
{
  "skills": [
    "example-skill"
  ]
}
```

The catalog ID must match the skill directory name.

## 3. Bundle it in a plugin when needed

A plugin references canonical skill IDs from `plugins/<plugin-id>/manifest.json`:

```json
{
  "components": {
    "skills": [
      "example-skill"
    ],
    "agents": [],
    "commands": []
  }
}
```

The generator copies the canonical skill and its license into each enabled host projection. A skill can remain standalone when no plugin bundle is needed.

## 4. Validate the repository

```text
npm run generate -- --plugin <plugin-id>
npm run verify
```

Skip generation when the skill is not referenced by a plugin. `verify` still validates every cataloged skill, including standalone-only skills.
