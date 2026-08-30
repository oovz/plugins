# Adding a standalone skill

Canonical skills live at `skills/<skill-id>/` and follow the [Agent Skills specification](https://agentskills.io/specification). A skill is authored once, validated independently, and referenced by any plugin that bundles it for a coding harness.

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

Catalog entries are IDs rather than paths. The fixed location is `skills/<skill-id>/`, which keeps discovery deterministic and removes path configuration.

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

The generator copies the canonical skill and its license into each enabled host projection. A cataloged skill may remain standalone when no plugin bundle is needed.

## 4. Validate the repository

```text
npm run generate -- --plugin <plugin-id>
npm run verify
```

Skip generation when the skill is not referenced by a plugin. `verify` still validates every cataloged skill, including standalone-only skills.
