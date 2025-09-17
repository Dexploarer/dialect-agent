// Simple dev script - starts backend and frontend concurrently
export {};

console.log("Starting backend...");
const backend = Bun.spawn(["bun", "run", "--hot", "src/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
});

// Wait for backend to be ready
await Bun.sleep(3000);

console.log("Starting frontend...");
const frontend = Bun.spawn(["bun", "run", "dev"], {
  cwd: "./frontend",
  stdout: "inherit", 
  stderr: "inherit",
});

process.on("SIGINT", () => {
  backend.kill();
  frontend.kill();
  process.exit(0);
});

await Promise.all([backend.exited, frontend.exited]);

