"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const { readJson } = require("../paths");
const { loadYaml } = require("./yaml");
const { discoverVerificationCommands } = require("./verification-discovery");
const { initProject, statePaths, transitionTask, writeEvidence } = require("./state");

function loadProfile(projectRoot, profileName = "default") {
  const profilePath = findProfilePath(projectRoot, profileName);
  if (profilePath) {
    const profile = loadYaml(profilePath, {});
    return normalizeProfile(profile, profileName, { path: profilePath, source: "file" });
  }
  return normalizeProfile(
    { name: profileName, steps: discoverVerificationCommands(projectRoot).map((command) => ({ name: command, command, required: true })) },
    profileName,
    { path: null, source: "auto-discovered" }
  );
}

function findProfilePath(projectRoot, profileName) {
  const base = path.join(projectRoot, "harness", "profiles");
  for (const extension of [".yaml", ".yml", ".json"]) {
    const candidate = path.join(base, `${profileName}${extension}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function normalizeProfile(profile, fallbackName, source = {}) {
  const rawSteps = Array.isArray(profile.steps) ? profile.steps : [];
  const normalizedSteps = rawSteps.map((step, index) => ({
    name: step.name || `step-${index + 1}`,
    command: step.command || "",
    required: step.required !== false,
    timeout: Number(step.timeout || profile.timeout || 120000),
    cwd: step.cwd || ".",
    env: step.env && typeof step.env === "object" ? step.env : {},
    artifacts: Array.isArray(step.artifacts) ? step.artifacts : []
  }));
  return {
    name: profile.name || fallbackName,
    requested_name: fallbackName,
    path: source.path || null,
    source: source.source || "unknown",
    timeout: Number(profile.timeout || 120000),
    raw_step_count: rawSteps.length,
    invalid_step_count: normalizedSteps.filter((step) => !step.command).length,
    steps: normalizedSteps.filter((step) => step.command)
  };
}

function inspectProfile(projectRoot, profileName = "default") {
  const profile = loadProfile(projectRoot, profileName);
  const stepCount = profile.steps.length;
  const requiredStepCount = profile.steps.filter((step) => step.required).length;
  const reasons = [];
  if (!profile.path && profile.source !== "auto-discovered") reasons.push(`Profile ${profileName} was not found.`);
  if (stepCount === 0) reasons.push(`Profile ${profile.name} has no executable verification steps.`);
  if (requiredStepCount === 0) reasons.push(`Profile ${profile.name} has no required verification steps.`);
  if (profile.invalid_step_count > 0) reasons.push(`${profile.invalid_step_count} configured verification step(s) have an empty command.`);
  return {
    name: profile.name,
    requested_name: profile.requested_name,
    path: profile.path,
    source: profile.source,
    file_exists: Boolean(profile.path),
    auto_discovered: profile.source === "auto-discovered",
    step_count: stepCount,
    raw_step_count: profile.raw_step_count,
    required_step_count: requiredStepCount,
    optional_step_count: stepCount - requiredStepCount,
    invalid_step_count: profile.invalid_step_count,
    ready: stepCount > 0 && requiredStepCount > 0,
    reasons,
    steps: profile.steps.map((step) => ({
      name: step.name,
      command: step.command,
      required: step.required,
      cwd: step.cwd,
      timeout: step.timeout
    }))
  };
}

function listProfiles(projectRoot) {
  const base = path.join(projectRoot, "harness", "profiles");
  const profiles = [];
  if (fs.existsSync(base)) {
    for (const entry of fs.readdirSync(base).sort()) {
      const extension = path.extname(entry);
      if (![".yaml", ".yml", ".json"].includes(extension)) continue;
      profiles.push(inspectProfile(projectRoot, path.basename(entry, extension)));
    }
  }
  return {
    ok: true,
    project_root: projectRoot,
    profiles
  };
}

function runProfile(projectRoot, options = {}) {
  initProject(projectRoot);
  const profileName = options.profile || "default";
  const profile = loadProfile(projectRoot, profileName);
  const inspection = inspectProfile(projectRoot, profileName);
  if (!inspection.ready) {
    const startedAt = new Date().toISOString();
    const evidence = writeEvidence(projectRoot, {
      status: "NO_VERIFICATION_STEPS",
      profile: profile.name,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      steps: [],
      artifacts: [],
      changed_files: changedFiles(projectRoot),
      risks: inspection.reasons
    });
    transitionTask(projectRoot, "NO_VERIFICATION_STEPS", "Verification profile has no required executable steps.", {
      current_step: "Configure required verification"
    });
    return {
      ok: false,
      project_root: projectRoot,
      profile: profile.name,
      inspection,
      evidence,
      summary: `${profile.name}: NO_VERIFICATION_STEPS`
    };
  }
  transitionTask(projectRoot, "VERIFYING", `Started verification profile ${profile.name}.`, { current_step: "Verification" });
  const startedAt = new Date().toISOString();
  const steps = profile.steps.map((step) => runStep(projectRoot, step));
  const failedRequired = steps.some((step) => step.required && step.exit_code !== 0);
  const finishedAt = new Date().toISOString();
  const evidence = writeEvidence(projectRoot, {
    status: failedRequired ? "FAILED_VERIFICATION" : "VERIFIED",
    profile: profile.name,
    started_at: startedAt,
    finished_at: finishedAt,
    steps,
    artifacts: collectArtifacts(projectRoot, profile, steps),
    changed_files: changedFiles(projectRoot),
    risks: failedRequired ? ["One or more required verification steps failed."] : []
  });
  transitionTask(
    projectRoot,
    failedRequired ? "FAILED_VERIFICATION" : "VERIFIED",
    failedRequired ? "Verification failed." : "Verification passed.",
    { current_step: failedRequired ? "Fix failed verification" : "Ready for review" }
  );
  return {
    ok: !failedRequired,
    project_root: projectRoot,
    profile: profile.name,
    inspection,
    evidence,
    summary: `${profile.name}: ${failedRequired ? "FAILED_VERIFICATION" : "VERIFIED"}`
  };
}

function runStep(projectRoot, step) {
  const startedAt = new Date().toISOString();
  const cwd = path.resolve(projectRoot, step.cwd || ".");
  const result = cp.spawnSync(step.command, {
    cwd,
    shell: true,
    encoding: "utf8",
    timeout: step.timeout,
    env: { ...process.env, ...step.env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    name: step.name,
    command: step.command,
    required: step.required,
    cwd: path.relative(projectRoot, cwd) || ".",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    exit_code: result.status ?? (result.error ? 1 : 0),
    signal: result.signal || null,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr),
    error: result.error ? result.error.message : null
  };
}

function trimOutput(value, limit = 8000) {
  const text = value || "";
  return text.length > limit ? `${text.slice(0, limit)}\n...<truncated>` : text;
}

function collectArtifacts(projectRoot, profile) {
  const artifacts = [];
  for (const step of profile.steps) {
    for (const artifact of step.artifacts) {
      const artifactPath = path.resolve(projectRoot, artifact);
      if (fs.existsSync(artifactPath)) {
        artifacts.push({
          path: path.relative(projectRoot, artifactPath),
          kind: fs.statSync(artifactPath).isDirectory() ? "directory" : "file"
        });
      }
    }
  }
  const evidencePath = statePaths(projectRoot).evidence;
  if (fs.existsSync(evidencePath)) artifacts.push({ path: path.relative(projectRoot, evidencePath), kind: "file" });
  return artifacts;
}

function changedFiles(projectRoot) {
  const gitPath = path.join(projectRoot, ".git");
  if (!fs.existsSync(gitPath)) return [];
  const result = cp.spawnSync("git status --short", {
    cwd: projectRoot,
    shell: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.slice(3).trim()).filter(Boolean);
}

function legacyVerify(projectRoot) {
  const commands = discoverVerificationCommands(projectRoot);
  const results = commands.map((command) => runStep(projectRoot, {
    name: command,
    command,
    required: true,
    cwd: ".",
    timeout: 120000,
    env: {},
    artifacts: []
  }));
  return {
    ok: results.every((result) => result.exit_code === 0),
    project_root: projectRoot,
    commands,
    results
  };
}

module.exports = {
  changedFiles,
  inspectProfile,
  legacyVerify,
  listProfiles,
  loadProfile,
  runProfile,
  runStep,
  trimOutput
};
