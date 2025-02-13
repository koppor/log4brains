import commander from "commander";
import { Log4brains } from "@log4brains/core";
import type { AppConsole } from "@log4brains/cli-common";
import {
  ListCommand,
  ListCommandOpts,
  NewCommand,
  NewCommandOpts
} from "./commands";

type Deps = {
  l4bInstance: Log4brains;
  appConsole: AppConsole;
  version: string;
};

export function createCli({
  l4bInstance,
  appConsole,
  version
}: Deps): commander.Command {
  const program = new commander.Command();
  program.version(version);

  const adr = program
    .command("adr")
    .description("Manage the Architecture Decision Records (ADR)");

  adr
    .command("new [title]")
    .description("Create an ADR", {
      title: "The title of the ADR. Required if --quiet is passed"
    })
    .option("-q, --quiet", "Disable interactive mode", false)
    .option(
      "-p, --package <package>",
      "To create the ADR for a specific package"
    )
    .option(
      "--from <file>",
      "Copy <file> contents into the ADR instead of using the default template"
    )
    .action(
      (title: string | undefined, opts: NewCommandOpts): Promise<void> => {
        return new NewCommand({ l4bInstance, appConsole }).execute(opts, title);
      }
    );

  // adr
  //   .command("quick")
  //   .description("Create a one-sentence ADR (Y-Statement)")
  //   .action(
  //     (): Promise<void> => {
  //       // TODO
  //     }
  //   );

  adr
    .command("list")
    .option(
      "-s, --statuses <statuses>",
      "Filter on the given statuses, comma-separated"
    ) // TODO: list available statuses
    .option("-r, --raw", "Use a raw format instead of a table", false)
    .description("List ADRs")
    .action(
      (opts: ListCommandOpts): Promise<void> => {
        return new ListCommand({ l4bInstance, appConsole }).execute(opts);
      }
    );

  return program;
}
