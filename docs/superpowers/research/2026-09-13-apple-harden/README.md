# Apple auth hardening evidence

`mechanism-report.md` is the original independent review, including exact
candidate heads, source hashes, commands and observed failures. Probe files
and their captured logs are archived unchanged. The manifest hashes those
original bytes. Credentials in probes are synthetic.

To replay, provide Node26 and the candidate dependencies, point imports at
checkouts of the candidate SHAs named in the report, and use a new isolated
PostgreSQL18.4 container. Replace only its dynamic connection port. The scripts
retain their original local paths and dependency symlink assumptions; no
node_modules tree is archived. Running them against corrected source is a
fix check, not a reproduction of the original faulty head. Provider runtime,
real-device behavior and naturally occurring callback ID collisions are not
established by these probes.
