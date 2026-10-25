import { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";

let sequence = 0;
let latest = { sequence, frame: -1, tasks: [] };
const execute = FrameGraph.prototype.execute;
// Passive observation of values handed to the real render tasks; never write task/settings state.
FrameGraph.prototype.execute = function () {
  const result = execute.call(this);
  latest = { sequence: ++sequence, frame: Number(document.querySelector("#current-frame")?.value), tasks: this.tasks
    .filter(task => /^(gamma|ssao)-fx-/.test(task.name)).map(task => {
      const settings = typeof task.getSettings === "function" ? task.getSettings() : null;
      return { name: task.name, disabled: task.disabled, gamma: settings?.gammaPower,
        strength: task.ssao?.totalStrength, radius: task.ssao?.radius };
    }) };
  return result;
};
export function effectBoundaryState() { return latest; }
