/* eslint-disable no-await-in-loop */
/* eslint-disable class-methods-use-this */
import fs, { promises as fsP } from "fs";
import terminalLink from "terminal-link";
import chalk from "chalk";
import hasYarn from "has-yarn";
import execa from "execa";
import mkdirp from "mkdirp";
import yaml from "yaml";
import path from "path";
import editJsonFile from "edit-json-file";
import moment from "moment-timezone";
import type { AppConsole } from "@log4brains/cli-common";
import { FailureExit } from "./FailureExit";

const assetsPath = path.resolve(path.join(__dirname, "../../assets"));
const docLink = "https://github.com/thomvaill/log4brains";
const cliBinPath = "@log4brains/cli/dist/log4brains";
const webBinPath = "@log4brains/web/dist/bin/log4brains-web";

function forceUnixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

export type InitCommandOpts = {
  defaults: boolean;
};

type L4bYmlPackageConfig = {
  name: string;
  path: string;
  adrFolder: string;
};
type L4bYmlConfig = {
  project: {
    name: string;
    tz: string;
    adrFolder: string;
    packages?: L4bYmlPackageConfig[];
  };
};

type Deps = {
  appConsole: AppConsole;
};

export class InitCommand {
  private readonly console: AppConsole;

  private hasYarnValue?: boolean;

  constructor({ appConsole }: Deps) {
    this.console = appConsole;
  }

  private hasYarn(): boolean {
    if (!this.hasYarnValue) {
      this.hasYarnValue = hasYarn();
    }
    return this.hasYarnValue;
  }

  private isDev(): boolean {
    return (
      process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
    );
  }

  private async installNpmPackages(cwd: string): Promise<void> {
    const packages = ["@log4brains/cli", "@log4brains/web"];

    if (this.isDev()) {
      await execa("yarn", ["link", ...packages], { cwd });

      // ... but unfortunately `yarn link` does not create the bin symlinks (https://github.com/yarnpkg/yarn/issues/5713)
      // we have to do it ourselves:
      await mkdirp(path.join(cwd, "node_modules/.bin"));
      await execa(
        "ln",
        ["-s", "--force", `../${cliBinPath}`, "node_modules/.bin/log4brains"],
        { cwd }
      );
      await execa(
        "ln",
        [
          "-s",
          "--force",
          `../${webBinPath}`,
          "node_modules/.bin/log4brains-web"
        ],
        { cwd }
      );

      this.console.println();
      this.console.println(
        `${chalk.bgBlue.white.bold(" DEV ")} ${chalk.blue(
          "Local packages are linked!"
        )}`
      );
      this.console.println();
    } else if (this.hasYarn()) {
      await execa(
        "yarn",
        ["add", "--dev", "--ignore-workspace-root-check", ...packages],
        { cwd }
      );
    } else {
      await execa("npm", ["install", "--save-dev", ...packages], { cwd });
    }
  }

  private setupPackageJsonScripts(packageJsonPath: string): void {
    const pkgJson = editJsonFile(packageJsonPath);
    pkgJson.set("scripts.adr", "log4brains adr");
    pkgJson.set("scripts.log4brains-preview", "log4brains-web preview");
    pkgJson.set("scripts.log4brains-build", "log4brains-web build");
    pkgJson.save();
  }

  private guessMainAdrFolderPath(cwd: string): string | undefined {
    const usualPaths = [
      "./docs/adr",
      "./docs/adrs",
      "./docs/architecture-decisions",
      "./doc/adr",
      "./doc/adrs",
      "./doc/architecture-decisions",
      "./adr",
      "./adrs",
      "./architecture-decisions"
    ];
    // eslint-disable-next-line no-restricted-syntax
    for (const possiblePath of usualPaths) {
      if (fs.existsSync(path.join(cwd, possiblePath))) {
        return possiblePath;
      }
    }
    return undefined;
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  private async buildLog4brainsConfigInteractively(
    cwd: string,
    noInteraction: boolean
  ): Promise<L4bYmlConfig> {
    this.console.println(
      `We will now help you to create your ${chalk.cyan(".log4brains.yml")}...`
    );
    this.console.println();

    // Name
    let name;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,global-require,import/no-dynamic-require,@typescript-eslint/no-var-requires
      name = require(path.join(cwd, "package.json")).name as string;
      if (!name) {
        throw Error("Empty name");
      }
    } catch (e) {
      this.console.warn(
        `Impossible to get the project name from your ${chalk.cyan(
          "package.json"
        )}`
      );
    }
    name = noInteraction
      ? name || "untitled"
      : await this.console.askInputQuestion(
          "What is the name of your project?",
          name
        );

    // Project type
    const type = noInteraction
      ? "mono"
      : await this.console.askListQuestion(
          "Which statement describes the best your project?",
          [
            {
              name: "Simple project (only one ADR folder)",
              value: "mono",
              short: "Mono-package project"
            },
            {
              name:
                "Multi-package project (one ADR folder per package + a global one)",
              value: "multi",
              short: "Multi-package project"
            }
          ]
        );

    // Main ADR folder location
    let adrFolder = this.guessMainAdrFolderPath(cwd);
    if (adrFolder) {
      this.console.println(
        `We have detected a possible existing ADR folder: ${chalk.cyan(
          adrFolder
        )}`
      );
      adrFolder =
        noInteraction ||
        (await this.console.askYesNoQuestion("Do you confirm?", true))
          ? adrFolder
          : undefined;
    }
    if (!adrFolder) {
      adrFolder = noInteraction
        ? "./docs/adr"
        : await this.console.askInputQuestion(
            `In which directory do you plan to store your ${
              type === "multi" ? "global " : ""
            }ADRs? (will be automatically created)`,
            "./docs/adr"
          );
    }
    await mkdirp(path.join(cwd, adrFolder));
    this.console.println();

    // Packages
    const packages = [];
    if (type === "multi") {
      this.console.println("We will now define your packages...");
      this.console.println();

      let oneMorePackage = false;
      let packageNumber = 1;
      do {
        this.console.println();
        this.console.println(
          `  ${chalk.underline(`Package #${packageNumber}`)}:`
        );
        const pkgName = await this.console.askInputQuestion(
          "Name? (short, lowercase, without special characters, nor spaces)"
        );
        const pkgCodeFolder = await this.askPathWhileNotFound(
          "Where is located the source code of this package?",
          cwd,
          `./packages/${pkgName}`
        );
        const pkgAdrFolder = await this.console.askInputQuestion(
          `In which directory do you plan to store the ADRs of this package? (will be automatically created)`,
          `${pkgCodeFolder}/docs/adr`
        );
        await mkdirp(path.join(cwd, pkgAdrFolder));
        packages.push({
          name: pkgName,
          path: forceUnixPath(pkgCodeFolder),
          adrFolder: forceUnixPath(pkgAdrFolder)
        });
        oneMorePackage = await this.console.askYesNoQuestion(
          `We are done with package #${packageNumber}. Do you want to add another one?`,
          false
        );
        packageNumber += 1;
      } while (oneMorePackage);
    }

    return {
      project: {
        name,
        tz: moment.tz.guess(),
        adrFolder: forceUnixPath(adrFolder),
        packages
      }
    };
  }

  private async createAdr(
    cwd: string,
    adrFolder: string,
    title: string,
    source: string,
    replacements: string[][] = []
  ): Promise<string> {
    const slug = (
      await execa(
        path.join(cwd, `node_modules/${cliBinPath}`),
        [
          "adr",
          "new",
          "--quiet",
          "--from",
          forceUnixPath(path.join(assetsPath, source)),
          `"${title}"`
        ],
        { cwd }
      )
    ).stdout;

    // eslint-disable-next-line no-restricted-syntax
    for (const replacement of [
      ["{DATE_YESTERDAY}", moment().subtract(1, "days").format("YYYY-MM-DD")], // we use yesterday's date so that we are sure new ADRs will appear on top
      ...replacements
    ]) {
      await execa(
        "sed",
        [
          "-i",
          `s/${replacement[0]}/${replacement[1]}/g`,
          forceUnixPath(path.join(cwd, adrFolder, `${slug}.md`))
        ],
        {
          cwd
        }
      );
    }

    return slug;
  }

  private async copyFileIfAbsent(
    cwd: string,
    adrFolder: string,
    filename: string,
    contentCb?: (content: string) => string
  ): Promise<void> {
    const outPath = path.join(cwd, adrFolder, filename);
    if (!fs.existsSync(outPath)) {
      let content = await fsP.readFile(
        path.join(assetsPath, filename),
        "utf-8"
      );
      if (contentCb) {
        content = contentCb(content);
      }
      await fsP.writeFile(outPath, content);
    }
  }

  private printSuccess(): void {
    const runCmd = this.hasYarn() ? "yarn" : "npm run";
    const l4bCliCmdName = "adr";

    this.console.success("Log4brains is installed and configured! 🎉🎉🎉");
    this.console.println();
    this.console.println("You can now use the CLI to create a new ADR:");
    this.console.println(`  ${chalk.cyan(`${runCmd} ${l4bCliCmdName} new`)}`);
    this.console.println("");
    this.console.println(
      "And start the web UI to preview your architecture knowledge base:"
    );
    this.console.println(`  ${chalk.cyan(`${runCmd} log4brains-preview`)}`);
    this.console.println();
    this.console.println(
      "Do not forget to set up your CI/CD to automatically publish your knowledge base"
    );
    this.console.println(
      `Check out the ${terminalLink(
        "documentation",
        docLink
      )} to see some examples`
    );
  }

  private async askPathWhileNotFound(
    question: string,
    cwd: string,
    defaultValue?: string
  ): Promise<string> {
    const p = await this.console.askInputQuestion(question, defaultValue);
    if (!p.trim() || !fs.existsSync(path.join(cwd, p))) {
      this.console.warn("This path does not exist. Please try again...");
      return this.askPathWhileNotFound(question, cwd, defaultValue);
    }
    return p;
  }

  /**
   * Command flow.
   *
   * @param options
   * @param customCwd
   */
  async execute(options: InitCommandOpts, customCwd?: string): Promise<void> {
    const noInteraction = options.defaults;

    const cwd = customCwd ? path.resolve(customCwd) : process.cwd();
    if (!fs.existsSync(cwd)) {
      this.console.fatal(`The given path does not exist: ${chalk.cyan(cwd)}`);
      throw new FailureExit();
    }

    // Check package.json existence
    const packageJsonPath = path.join(cwd, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      this.console.fatal(`Impossible to find ${chalk.cyan("package.json")}`);
      this.console.printlnErr(
        "Are you sure to execute the command inside your project's root directory?"
      );
      this.console.printlnErr(
        `Please refer to the ${terminalLink(
          "documentation",
          docLink
        )} if you want to use Log4brains in a non-JS project or globally`
      );
      throw new FailureExit();
    }

    // Install NPM packages
    this.console.startSpinner("Install Log4brains packages...");
    await this.installNpmPackages(cwd);
    this.console.stopSpinner();

    // Setup package.json scripts
    this.setupPackageJsonScripts(packageJsonPath);
    this.console.println(
      `We have added the following scripts to your ${chalk.cyan(
        "package.json"
      )}:`
    );
    this.console.println(" - adr");
    this.console.println(" - log4brains-preview");
    this.console.println(" - log4brains-init");
    this.console.println();

    // Terminate now if already configured
    if (fs.existsSync(path.join(cwd, ".log4brains.yml"))) {
      this.console.warn(
        `${chalk.bold(".log4brains.yml")} already exists. We won't override it`
      );
      this.console.warn(
        "Please remove it and execute this command again if you want to configure it interactively"
      );
      this.console.println();
      this.printSuccess();
      return;
    }

    // Create .log4brains.yml interactively
    const config = await this.buildLog4brainsConfigInteractively(
      cwd,
      noInteraction
    );

    this.console.startSpinner("Write config file...");
    const { adrFolder } = config.project;
    await fsP.writeFile(
      path.join(cwd, ".log4brains.yml"),
      yaml.stringify(config),
      "utf-8"
    );

    // Copy template, index and README if not already created
    this.console.updateSpinner("Copy template files...");
    await this.copyFileIfAbsent(cwd, adrFolder, "template.md");
    await this.copyFileIfAbsent(cwd, adrFolder, "index.md", (content) =>
      content.replace(/{PROJECT_NAME}/g, config.project.name)
    );
    await this.copyFileIfAbsent(cwd, adrFolder, "README.md");

    // List existing ADRs
    this.console.updateSpinner("Create your first ADR...");
    const adrListRes = await execa(
      path.join(cwd, `node_modules/${cliBinPath}`),
      ["adr", "list", "--raw"],
      { cwd }
    );

    // Create Log4brains ADR
    const l4bAdrSlug = await this.createAdr(
      cwd,
      adrFolder,
      "Use Log4brains to manage the ADRs",
      "use-log4brains-to-manage-the-adrs.md"
    );

    // Create MADR ADR if there was no ADR in the repository
    if (!adrListRes.stdout) {
      await this.createAdr(
        cwd,
        adrFolder,
        "Use Markdown Architectural Decision Records",
        "use-markdown-architectural-decision-records.md",
        [["{LOG4BRAINS_ADR_SLUG}", l4bAdrSlug]]
      );
    }

    // End
    this.console.stopSpinner();
    this.printSuccess();
  }
}
