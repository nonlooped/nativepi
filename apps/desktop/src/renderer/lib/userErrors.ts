/** Keep precise transport/filesystem evidence available without requiring people to decode it. */
export function explainError(detail: string) {
  const plain = detail.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "").replace(/^Error:\s*/, "");
  let message = plain;
  if (/ENOENT|ENOTDIR/.test(plain)) message = "The file or folder is no longer available. Reopen its folder and try again.";
  else if (/EACCES|EPERM|permission denied/i.test(plain)) message = "NativePi could not access a file or folder. Check its permissions, then try again.";
  else if (/service disconnected|background service stopped/i.test(plain)) message = "Background work is disconnected. Reconnect on the computer to continue.";
  else if (/ZodError|Unexpected token|not valid JSON|\"code\"\s*:|Invalid input: expected/.test(plain)) message = "Some saved information could not be read. Try again or open the error details.";
  else if (/not a git repository/i.test(plain)) message = "Separate workspaces and saved versions need a Git project. You can still work in the current folder.";
  else if (/invalid.*branch|not a valid.*(?:name|ref)|not a valid object name|ambiguous argument|invalid reference/i.test(plain)) message = "Choose another branch name or saved starting version in Branch options, then try again.";
  else if (/already exists/i.test(plain)) message = "An item already uses that name. Choose another name and try again.";
  else if (plain.length > 240 || /\n\s+at |\/Users\/|\/home\/|[A-Z]:\\/.test(plain)) message = "The action could not finish. Try again or open the error details.";
  return { message, details: message !== detail ? detail : undefined };
}
