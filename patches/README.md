# Pi session summary cache

The pinned Pi 1.5.2 patch adds an in-memory, revision-validated cache inside Pi's
own session discovery implementation. NativePi continues to use Pi's parser,
file layout, summary semantics, and public discovery APIs. No transcript data
is persisted separately.

The cache retains at most 1,000 summaries and an estimated 8 MiB of text and
metadata. Completed scans are validated against inode, size, mtime and ctime;
returned dates and summary objects are copied so callers cannot mutate cached
results. Abort signals remain authoritative on warm hits.

Review or remove the patch when upgrading Pi. Run the session regression suite,
including external rewrites and caller mutation, and rerun archive benchmarks.
