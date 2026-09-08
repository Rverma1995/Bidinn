export function resolveMigrationName(scriptName: string): string {
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--name" || arg === "-n") {
      const value = args[i + 1];
      if (value && !value.startsWith("-")) {
        return value;
      }
    }
    if (arg.startsWith("--name=")) {
      const value = arg.slice("--name=".length);
      if (value) {
        return value;
      }
    }
  }

  const positional = args.find((arg) => !arg.startsWith("-"));
  if (positional) {
    return positional;
  }

  const fromConfig = process.env.npm_config_name;
  if (fromConfig) {
    return fromConfig;
  }

  printUsage(scriptName);
  process.exit(1);
}

function printUsage(scriptName: string): void {
  console.error("Missing migration name.\n");
  console.error("Usage:");
  console.error(`  yarn ${scriptName} DescriptiveName`);
  console.error(`  yarn ${scriptName} --name DescriptiveName`);
  console.error(`  npm run ${scriptName} -- DescriptiveName`);
}
