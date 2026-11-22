// Windows signing hook for electron-builder (win.signtoolOptions.sign).
// Without WIN_SIGN_COMMAND the build stays unsigned and still succeeds: SmartScreen warns on install.
// With a code signing certificate, set WIN_SIGN_COMMAND to the signer's command line, with {file}
// where the file path goes (CodeSignTool for SSL.com eSigner, jsign, signtool...). Secrets stay in
// other environment variables that the command reads. See README, "Assinatura de código".
// eslint-disable-next-line @typescript-eslint/no-require-imports -- electron-builder loads the hook as CommonJS
const { execSync } = require("node:child_process");

exports.default = async function sign(configuration) {
  const command = process.env.WIN_SIGN_COMMAND;
  if (!command) return;
  const file = JSON.stringify(configuration.path);
  execSync(command.split("{file}").join(file), { stdio: "inherit" });
};
