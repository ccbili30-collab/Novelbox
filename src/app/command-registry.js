export function createCommandRegistry(handlers) {
  return function handleCommand(command, target) {
    const handler = handlers[command];
    if (!handler) return;
    return handler(target);
  };
}
