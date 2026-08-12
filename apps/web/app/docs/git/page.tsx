import type { Metadata } from "next";

import { H2, Note, PageTitle, Prose } from "@/components/docs/Prose";

export const metadata: Metadata = {
  title: "Git and worktrees",
  description: "Review repository changes, stage files or hunks, commit, push, open pull requests, and add worktrees in NativePi.",
};

export default function GitPage() {
  return (
    <>
      <PageTitle
        eyebrow="Using NativePi"
        title="Git and worktrees"
        lede="NativePi keeps common review and handoff actions beside the conversation without trying to replace a full Git client."
      />

      <H2 id="review">Review changes</H2>
      <Prose>
        <p>
          The context pane shows repository status, changed files, and
          working-tree diffs. File changes reported during an agent turn link to
          the same review surface so you can inspect the resulting patch without
          leaving the chat.
        </p>
      </Prose>

      <H2 id="stage">Stage and commit</H2>
      <Prose>
        <p>
          Stage a whole file or an individual diff hunk, then create a commit
          from the staged changes. You can ask Pi to draft commit wording before
          you confirm it. NativePi does not create hidden commits or checkpoints.
        </p>
      </Prose>

      <H2 id="push">Push and open a pull request</H2>
      <Prose>
        <p>
          Push the current branch from the Git surface, or fast-forward it from
          its remote before pushing. The commit graph shows local and remote
          history. When the GitHub CLI is installed and authenticated, NativePi
          can open a GitHub pull request through <code>gh</code>.
        </p>
      </Prose>

      <H2 id="branches">Branches and worktrees</H2>
      <Prose>
        <p>
          Switch to or create a branch from the composer when the working tree is
          clean. Add a Git worktree from the project menu; NativePi pins that
          worktree as a separate project so its chats and terminals remain
          scoped to the correct folder.
        </p>
      </Prose>

      <Note>
        NativePi deliberately does not merge, rebase, discard changes, roll back
        work, create checkpoints, or rewrite history. Use your normal Git tools
        for those operations.
      </Note>
    </>
  );
}
