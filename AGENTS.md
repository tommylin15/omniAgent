# omniAgent project rules

omniAgent is the authoritative project for its own source, API, schema, migrations, tests, CI/CD, deployment, runtime evidence, credentials and product documentation.

- Use this repository and omniAgent runtime evidence as the current-state source of truth.
- Do not read another project's repository to infer omniAgent current state, credentials, deployment wiring or completion.
- External systems, including Janus, are integration targets only through approved bounded API/MCP contracts. Do not import their internals or read their DB/GCS/Iceberg directly.
- omniAgent may modify its own code, tests, migrations, CI/CD, infra and deployment config, commit/push main, deploy candidates and run acceptance.
- Completion requires implementation -> tests -> CI -> deployment -> runtime/integration evidence. Partial success is not DONE.
- Missing values must remain explicit; never fabricate credentials, resource names, runtime state or acceptance results.
