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
          Open the files and changes pane from the chat header and select
          <strong> Changes</strong>. It shows repository status, changed files,
          and working-tree diffs.
          File changes reported during an agent turn link to
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
        <p>
          For the current branch&apos;s pull request, NativePi also shows its
          description, checks, comments, linked issues, and comparison against
          the base branch. GitHub authentication belongs to your installed CLI.
        </p>
        <p>
          GitLab projects can display merge requests and issues through an
          authenticated <code>glab</code> installation. The app&apos;s pull-request
          creation action is for GitHub; create a GitLab merge request with your
          usual GitLab tools. A branch containing an issue number can show that
          issue when there is no pull or merge request.
        </p>
      </Prose>

      <H2 id="branches">Branches and worktrees</H2>
      <Prose>
        <p>
          Switch to or create a branch from the files and changes pane when the
          working tree is clean. Choose <strong>Worktrees…</strong> from the
          project actions menu beside the sidebar project filter; NativePi pins that
          worktree as a separate project so its chats and terminals remain
          scoped to the correct folder.
        </p>
      </Prose>

      <H2 id="revert">Revert a tracked file</H2>
      <Prose>
        <p>
          Choose <strong>Revert</strong> on an unstaged tracked file and confirm
          to restore its working-tree contents from the index. Staged changes
          remain intact; untracked files are not deleted. This discards that
          file&apos;s unstaged edits and cannot be undone by NativePi.
        </p>
      </Prose>

      <Note>
        NativePi does not merge, rebase, create checkpoints, or rewrite history.
        Use your normal Git tools for those operations.
      </Note>
    </>
  );
}
