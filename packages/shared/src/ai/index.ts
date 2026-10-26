// Combat AI (spec 019). The trainers spec reuses createController with its own profile, fills
// AiHooks.chooseSwitch / chooseItem, and uses sight.ts for NPCs that spot the player.
export * from "./action.ts";
export * from "./controller.ts";
export * from "./perception.ts";
export * from "./profile.ts";
export * from "./schemas.ts";
export * from "./scoring.ts";
export * from "./sight.ts";
export * from "./threat.ts";
export * from "./view.ts";
