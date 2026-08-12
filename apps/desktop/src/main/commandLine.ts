/**
 * Parse the command field as arguments, not as a shell program.  The command
 * is passed to Pi as an argv array, so shell escapes and environment expansion
 * would only corrupt literal arguments such as Windows paths.
 */
export function parseCommandLine(value: string): string[] {
  const arguments_: string[] = [];
  let argument = "";
  let quote: "'" | '"' | undefined;
  let hasArgument = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quote) {
      if (character === quote) {
        if (quote === '"' && value[index + 1] === '"') {
          argument += '"';
          index += 1;
        } else {
          quote = undefined;
        }
      } else {
        argument += character;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      hasArgument = true;
    } else if (/\s/.test(character)) {
      if (hasArgument) {
        arguments_.push(argument);
        argument = "";
        hasArgument = false;
      }
    } else {
      argument += character;
      hasArgument = true;
    }
  }

  if (quote) throw new Error("The npm command has an unterminated quote.");
  if (hasArgument) arguments_.push(argument);
  return arguments_;
}

export function formatCommandLine(arguments_: string[]): string {
  return arguments_
    .map((argument) => /[\s'"]/.test(argument) ? `"${argument.replaceAll('"', '""')}"` : argument)
    .join(" ");
}
