import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceProductionSeconds, createProductionState, liftRatePerMinute, shaftRatePerMinute, tickProductionSecond } from '../src/production.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const defaultOutputDir = resolve(repoRoot, 'docs/development/calibration');
const outputDir = parseOutputDir(process.argv.slice(2));
const seed = 'C01-production-fixture-2026-10-v1';
const candidateGrowth = [1.03, 1.0311, 1.0316, 1.032];
const sweepLevels = [1, 10, 100, 250, 500, 800, 1000];
const MAX = Number.MAX_SAFE_INTEGER;

function parseOutputDir(args) {
  if (args.length === 0) return defaultOutputDir;
  if (args.length !== 2 || args[0] !== '--out') throw new Error('Usage: node scripts/calibrate-production.mjs [--out ../docs/development/calibration]');
  const resolved = resolve(process.cwd(), args[1]);
  if (resolved !== defaultOutputDir) throw new Error('Calibration output is fixed at docs/development/calibration');
  return resolved;
}

function unit(seedValue, label) {
  const digest = createHash('sha256').update(`${seedValue}\u0000${label}`).digest();
  return digest.readUInt32BE(0) / 0x100000000;
}

function seededScenario(label, scenarioSeed) {
  return {
    label,
    seed: scenarioSeed,
    soilModifier: 0.75 + unit(scenarioSeed, 'soil') * 0.5,
    weatherModifier: 0.75 + unit(scenarioSeed, 'weather') * 0.5,
    buffsMultiplier: 1,
  };
}

const scenarios = [
  { label: 'Neutral fixture', seed, soilModifier: 1, weatherModifier: 1, buffsMultiplier: 1 },
  seededScenario('Seeded soil/weather fixture A', `${seed}-A`),
  seededScenario('Seeded soil/weather fixture B', `${seed}-B`),
];
const analyticalEnvelope = {
  label: 'Analytical input-envelope ceiling (study fixture only)',
  seed: null,
  soilModifier: 1.25,
  weatherModifier: 1.25,
  buffsMultiplier: 1,
};
const comparisonScenarios = [...scenarios, analyticalEnvelope];

function shaftConfig(number, { depthGrowth = 2.2, digLevel = 1000, workersAssigned = 60, bunkhouseLevel = 10, cartLevel = 10, scenario = scenarios[0], bufferCapacityUnits = MAX, bufferUnits = 0 } = {}) {
  return {
    shaftNumber: number,
    oreId: `ore-${(number - 1) % 7 + 1}`,
    digLevel,
    bunkhouseLevel,
    workersAssigned,
    cartLevel,
    depthGrowth,
    baseRatePerWorkerPerMinute: 1,
    soilModifier: scenario.soilModifier,
    weatherModifier: scenario.weatherModifier,
    buffsMultiplier: scenario.buffsMultiplier,
    bufferCapacityUnits,
    bufferUnits,
  };
}

function maxShaftRate({ depthGrowth = 2.2, scenario = scenarios[0] } = {}) {
  return Array.from({ length: 30 }, (_, index) => shaftRatePerMinute(shaftConfig(index + 1, { depthGrowth, scenario }))).reduce((sum, rate) => sum + rate, 0);
}

function sumRows(rows) { return rows.reduce((sum, row) => sum + row.units, 0); }

function createFlowFixture({ shafts, lift, yardCapacity = MAX, yardStock = [], drainPerSecond = 0 }) {
  return createProductionState({
    shafts,
    lift,
    surface: { capacityUnits: yardCapacity, unitsByOre: yardStock },
    syntheticDownstreamDrain: { unitsPerSecond: drainPerSecond },
  });
}

function runFlow(initial, seconds) {
  return advanceProductionSeconds(initial, { seconds, maxSteps: seconds }).state;
}

function flowSummary(state) {
  const bufferUnits = state.shafts.reduce((sum, item) => sum + item.bufferUnits, 0);
  const surfaceUnits = sumRows(state.surface.unitsByOre);
  const drainedUnits = sumRows(state.syntheticDownstreamDrain.drainedByOre);
  const minedUnits = sumRows(state.cumulativeMinedByOre);
  const initialUnits = sumRows(state.initialUnitsByOre);
  const accountedUnits = initialUnits + minedUnits;
  const conservedUnits = bufferUnits + surfaceUnits + drainedUnits;
  return { seconds: state.elapsedSeconds, initialUnits, minedUnits, bufferUnits, surfaceUnits, drainedUnits, accountedUnits, conservedUnits, massBalanceResidualUnits: Math.abs(accountedUnits - conservedUnits) };
}

function checkAllLiftLevels(curve, growth = null) {
  let peak = 0;
  for (let level = 0; level <= 1000; level += 1) {
    const rate = liftRatePerMinute({ liftLevel: level, baseRatePerMinute: 2, growth, curve });
    if (!Number.isFinite(rate) || rate > MAX) throw new Error(`Unsafe lift rate for ${curve} growth ${growth} at level ${level}`);
    peak = rate;
  }
  return { checkedLevels: 1001, level1000Rate: peak, safeIntegerMagnitude: peak <= MAX };
}

function makeReport() {
  const neutralShaftOutput = maxShaftRate();
  const scenarioMaxRates = Object.fromEntries(comparisonScenarios.map((scenario) => [scenario.label, maxShaftRate({ scenario })]));
  const rateSweep = sweepLevels.map((level) => ({
    level,
    shaftOneDigFactor: 1 + 0.04 * level,
    linearLiftUnitsPerMinute: liftRatePerMinute({ liftLevel: level, baseRatePerMinute: 2, curve: 'linear-reference' }),
    exponentialLiftUnitsPerMinute: Object.fromEntries(candidateGrowth.map((growth) => [String(growth), liftRatePerMinute({ liftLevel: level, baseRatePerMinute: 2, growth, curve: 'exponential' })])),
  }));
  const liftProfiles = [
    { label: 'Legacy linear reference', curve: 'linear-reference', growth: null, maxLiftRate: liftRatePerMinute({ liftLevel: 1000, baseRatePerMinute: 2, curve: 'linear-reference' }) },
    ...candidateGrowth.map((growth) => ({
      label: `Exponential growth ${growth}`,
      curve: 'exponential',
      growth,
      maxLiftRate: liftRatePerMinute({ liftLevel: 1000, baseRatePerMinute: 2, growth, curve: 'exponential' }),
    })),
  ].map((profile) => {
    const scenarioComparisons = comparisonScenarios.map((scenario) => {
      const shaftOutput = scenarioMaxRates[scenario.label];
      const ratio = profile.maxLiftRate / shaftOutput;
      return { scenario: scenario.label, shaftOutput, liftToShaftRatio: ratio, passesLiftThroughput: ratio >= 1 };
    });
    return {
      ...profile,
      balancedMaxShaftRate: neutralShaftOutput,
      liftToShaftRatio: profile.maxLiftRate / neutralShaftOutput,
      liftHeadroomPercent: (profile.maxLiftRate / neutralShaftOutput - 1) * 100,
      reachableLiftLevels: checkAllLiftLevels(profile.curve, profile.growth),
      scenarioComparisons,
    };
  });

  const depthSensitivity = [2.2, 2.0].map((depthGrowth) => ({
    label: depthGrowth === 2.2 ? 'Rulebook shaft-depth factor' : 'Sensitivity only: gentler shaft-depth factor',
    depthGrowth,
    balancedMaxShaftRate: maxShaftRate({ depthGrowth }),
  }));

  const scenarioRates = scenarios.map((scenario) => {
    const scenarioInitial = createFlowFixture({
      shafts: [shaftConfig(1, { digLevel: 1, workersAssigned: 5, bunkhouseLevel: 0, cartLevel: 0, scenario, bufferCapacityUnits: 10 })],
      lift: { level: 1, baseRatePerMinute: 2, curve: 'exponential', growth: 1.0311 },
      yardCapacity: 100,
      drainPerSecond: 0.01,
    });
    return {
      label: scenario.label,
      seed: scenario.seed,
      soilModifier: scenario.soilModifier,
      weatherModifier: scenario.weatherModifier,
      buffsMultiplier: scenario.buffsMultiplier,
      firstShaftUnitsPerMinute: shaftRatePerMinute(shaftConfig(1, { digLevel: 1, workersAssigned: 5, bunkhouseLevel: 0, cartLevel: 0, scenario })),
      balancedMaxUnitsPerMinute: maxShaftRate({ scenario }),
      flowFixture: { seconds: 600, syntheticDrainUnitsPerSecond: 0.01, ...flowSummary(runFlow(scenarioInitial, 600)) },
    };
  });

  const earlyConfig = (drainPerSecond) => createFlowFixture({
    shafts: [shaftConfig(1, { digLevel: 1, workersAssigned: 5, bunkhouseLevel: 0, cartLevel: 0, scenario: scenarios[0], bufferCapacityUnits: 10 })],
    lift: { level: 1, baseRatePerMinute: 2, curve: 'exponential', growth: 1.0311 },
    yardCapacity: 100,
    drainPerSecond,
  });
  const earlyOutput = {
    fixtureRateUnitsPerMinute: shaftRatePerMinute(shaftConfig(1, { digLevel: 1, workersAssigned: 5, bunkhouseLevel: 0, cartLevel: 0 })),
    tenMinuteNoDrain: flowSummary(runFlow(earlyConfig(0), 600)),
    tenMinuteSyntheticDrain: flowSummary(runFlow(earlyConfig(0.01), 600)),
  };

  const lowLiftInitial = createFlowFixture({
    shafts: [shaftConfig(1, { scenario: scenarios[0], bufferCapacityUnits: 10 })],
    lift: { level: 0, baseRatePerMinute: 2, curve: 'linear-reference' },
    drainPerSecond: 0,
  });
  const lowLift = flowSummary(runFlow(lowLiftInitial, 60));
  const fullYardInitial = createFlowFixture({
    shafts: [shaftConfig(1, { workersAssigned: 0, bufferCapacityUnits: 10, bufferUnits: 2, scenario: scenarios[0] })],
    lift: { level: 1000, baseRatePerMinute: 2, growth: 1.0311, curve: 'exponential' },
    yardCapacity: 100,
    yardStock: [{ oreId: 'ore-1', units: 100 }],
  });
  const fullYard = flowSummary(tickProductionSecond(fullYardInitial));
  const highLiftMultiOreInitial = createFlowFixture({
    shafts: Array.from({ length: 30 }, (_, index) => shaftConfig(index + 1, { scenario: scenarios[0] })),
    lift: { level: 1000, baseRatePerMinute: 2, growth: 1.0311, curve: 'exponential' },
  });
  const highLiftMultiOre = flowSummary(tickProductionSecond(highLiftMultiOreInitial));
  const flowCases = { lowLiftBuffering: lowLift, fullYard, highLiftMultiOre };
  const flowSummaries = [earlyOutput.tenMinuteNoDrain, earlyOutput.tenMinuteSyntheticDrain, ...scenarioRates.map((row) => row.flowFixture), ...Object.values(flowCases)];
  const maxMassBalanceResidual = Math.max(...flowSummaries.map((summary) => summary.massBalanceResidualUnits));
  const replayInitial = earlyConfig(0.01);
  const chunkReplay = advanceProductionSeconds(replayInitial, { seconds: 600, maxSteps: 600 }).state;
  let oneSecondReplay = replayInitial;
  for (let index = 0; index < 600; index += 1) oneSecondReplay = tickProductionSecond(oneSecondReplay);
  const chunkReplayEqual = JSON.stringify(chunkReplay) === JSON.stringify(oneSecondReplay);
  if (!chunkReplayEqual) throw new Error('One-second fixture replay does not match bounded catch-up fixture');

  const monthHorizonBookkeeping = [28, 29, 30, 31].map((days) => {
    const horizonSeconds = days * 24 * 60 * 60;
    const preview = advanceProductionSeconds(earlyConfig(0), { seconds: horizonSeconds, maxSteps: 60 });
    return { days, horizonSeconds, boundedPreviewSteps: preview.processedSeconds, remainingSeconds: preview.remainingSeconds, complete: preview.remainingSeconds === 0 };
  });

  return {
    reportSchemaVersion: 1,
    studyStatus: 'EXPERIMENTAL_C01_FIXTURE_CALIBRATION',
    studySeed: seed,
    units: { shaftAndLiftRates: 'units per minute', tickDuration: 'one second', inventory: 'units' },
    studyBases: {
      shaftOneBasePerWorkerPerMinute: 1,
      liftBaseUnitsPerMinute: 2,
      shaftDepthGrowth: 2.2,
      digRateFormula: 'baseRate * depthGrowth^(shaftNumber-1) * (1 + 0.04*digLevel)',
      utilizationFormula: '0.25 + 0.075*cartLevel',
      shaftRateFormula: 'workersAssigned * digRate * soil * weather * utilization * buffs',
      liftProfiles: ['linear-reference: base * (1 + 0.04*liftLevel)', 'exponential: base * growth^liftLevel'],
      workerCapacityFixture: '10 + 5*bunkhouseLevel; max bunkhouse level 10',
      c01Status: 'These study bases are experimental fixtures, not approved universal production defaults.',
      flowFixtureLiftGrowth: '1.0311 is retained in the small flow fixtures as the previous neutral-only candidate for comparison; it is not the recommended next calibration benchmark.',
    },
    fixtures: {
      fullyUpgradedBalanced: { shaftCount: 30, workersPerShaft: 60, digLevel: 1000, cartLevel: 10, bunkhouseLevel: 10, soil: 1, weather: 1, buffs: 1, liftBaseUnitsPerMinute: 2, liftLevel: 1000 },
      analyticalInputEnvelope: { soil: 1.25, weather: 1.25, buffs: 1, label: 'selected study-generator envelope only; not world limits' },
      earlyTenMinute: { shaftCount: 1, workers: 5, digLevel: 1, cartLevel: 0, bunkhouseLevel: 0, liftLevel: 1, surfaceCapacityUnits: 100, shaftBufferCapacityUnits: 10, drainRatesUnitsPerSecond: [0, 0.01] },
      lowLiftBuffering: { shaftCount: 1, workers: 60, digLevel: 1000, cartLevel: 10, bufferCapacityUnits: 10, liftBaseUnitsPerMinute: 2, liftCurve: 'linear-reference', liftLevel: 0, seconds: 60 },
      fullYard: { surfaceCapacityUnits: 100, initialSurfaceUnits: 100, existingShaftBufferUnits: 2, workers: 0, liftLevel: 1000, seconds: 1 },
      highLiftMultiOre: { shaftCount: 30, oreIds: 7, workersPerShaft: 60, digLevel: 1000, cartLevel: 10, liftBaseUnitsPerMinute: 2, liftGrowth: 1.0311, liftLevel: 1000, seconds: 1 },
      tickOrder: ['mine assigned workforce into per-shaft buffers in ascending shaft number', 'move buffered units through the shared lift in ascending shaft number', 'drain surface yard at the explicit synthetic downstream rate in code-unit ore order'],
    },
    rateSweep,
    liftProfiles,
    analyticalEnvelope: { ...analyticalEnvelope, balancedMaxShaftUnitsPerMinute: scenarioMaxRates[analyticalEnvelope.label] },
    depthSensitivity,
    scenarioRates,
    earlyOutput,
    flowCases,
    chunkReplay: { seconds: 600, catchupMaxSteps: 600, oneSecondTicks: 600, finalFixtureStateEqual: chunkReplayEqual },
    massBalance: {
      maxObservedAbsoluteResidualUnits: maxMassBalanceResidual,
      acceptanceTolerance: '128 * Number.EPSILON * max(1, absolute accounted units, absolute physical units), checked independently per ore',
      scope: 'floating-point ore-unit fixture only; coin is not modeled and remains subject to exact integer ledger accounting',
    },
    monthHorizonBookkeeping,
    interpretation: {
      previousNeutralCandidate: '1.0311 exponential lift growth has 4.08% headroom in the neutral fixture but fails both deterministic seeded soil/weather fixtures and the selected analytical study envelope.',
      provisionalBenchmarkCandidate: '1.0316 exponential lift growth is recommended for the next pipeline calibration because it clears the selected soil=1.25, weather=1.25, buffs=1 analytical study envelope; it is not a certified global default.',
      scope: 'Structural lift throughput only; it does not certify economic balance or the complete mine-to-market pipeline. Chunk replay equality applies only to this fixture and does not establish production/live equivalence.',
      downstream: 'Finite surface storage, loading rates, fleet capacity, shipment timing, buyer budgets, prices, and affordability remain separate C-01 calibration work.',
      simulations: 'Month rows are bounded bookkeeping previews (60 executed ticks), not completed 28/29/30/31-day production simulations.',
      flow: 'The synthetic downstream drain removes units from the fixture surface yard only; it does not ship cargo, create payments, or create coin.',
      omitted: 'No workforce allocation, ore depletion, weather generation, hazards, shipping, market, or player strategy is modeled.',
      workforce: 'Worker counts are explicit assigned-shaft fixture inputs; habitat pool constraints, autoallocation, and production-UI wiring remain unimplemented.',
      productionConfig: 'No production configuration is changed or written by this study.',
    },
  };
}

function fmt(value) {
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(3)}T`;
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(3)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(3)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(3)}K`;
  return Number(value.toFixed(6)).toString();
}

function toMarkdown(report) {
  const profileRows = report.liftProfiles.map((profile) => `| ${profile.label} | ${fmt(profile.maxLiftRate)} | ${fmt(profile.balancedMaxShaftRate)} | ${profile.liftToShaftRatio.toFixed(5)} | ${profile.liftHeadroomPercent.toFixed(2)}% |`).join('\n');
  const comparisonRows = report.liftProfiles.flatMap((profile) => profile.scenarioComparisons.map((comparison) => `| ${profile.label} | ${comparison.scenario} | ${fmt(comparison.shaftOutput)} | ${fmt(profile.maxLiftRate)} | ${comparison.liftToShaftRatio.toFixed(5)} | ${comparison.passesLiftThroughput} |`)).join('\n');
  const sweepRows = report.rateSweep.map((row) => `| ${row.level} | ${row.shaftOneDigFactor.toFixed(2)} | ${fmt(row.linearLiftUnitsPerMinute)} | ${fmt(row.exponentialLiftUnitsPerMinute['1.03'])} | ${fmt(row.exponentialLiftUnitsPerMinute['1.0311'])} | ${fmt(row.exponentialLiftUnitsPerMinute['1.0316'])} | ${fmt(row.exponentialLiftUnitsPerMinute['1.032'])} |`).join('\n');
  const scenarioRows = report.scenarioRates.map((row) => `| ${row.label} | ${row.soilModifier.toFixed(4)} | ${row.weatherModifier.toFixed(4)} | ${row.firstShaftUnitsPerMinute.toFixed(4)} | ${fmt(row.balancedMaxUnitsPerMinute)} |`).join('\n');
  const monthRows = report.monthHorizonBookkeeping.map((row) => `| ${row.days} | ${row.horizonSeconds} | ${row.boundedPreviewSteps} | ${row.remainingSeconds} | ${row.complete} |`).join('\n');
  const early = report.earlyOutput;
  const caseRows = Object.entries(report.flowCases).map(([name, value]) => `| ${name} | ${fmt(value.minedUnits)} | ${fmt(value.bufferUnits)} | ${fmt(value.surfaceUnits)} | ${fmt(value.drainedUnits)} |`).join('\n');
  return `# Production C-01 calibration fixture study

Status: **experimental fixture calibration**. These values are not approved universal production defaults and do not certify economic balance.

## Inputs

The study uses a fixture shaft-one base of **1 unit per worker per minute** and a fixture lift base of **2 units per minute**. Shaft depth growth is 2.2, dig output uses the existing 1 + 0.04 × level formula, cart utilization uses 0.25 + 0.075 × cart level, and max workers are 10 + 5 × bunkhouse level. Catch-up calls the same explicit one-second tick function in this fixture. A 600-second chunk and 600 one-second fixture calls produce the same state; this does not establish production/live equivalence. Soil, weather, and buffs are direct inputs; seeded soil/weather modifiers come from deterministic study labels.

The exponential lift candidates are compared with the legacy linear reference 2 × (1 + 0.04 × lift level). Maximal shaft output assumes 30 shafts, 60 assigned workers each, dig 1000, carts 10, neutral soil/weather/buffs. This is a structural throughput fixture, not a strategy or affordability simulation. The small flow fixtures retain lift growth 1.0311 as the earlier neutral-only candidate for comparison.

## Balanced maximum lift comparison

| Lift curve | Lift at level 1000 (units/min) | Max shaft output (units/min) | Lift / shaft | Lift headroom |
|---|---:|---:|---:|---:|
${profileRows}

For the 1.0311 candidate, maximal neutral shaft output is ${fmt(report.liftProfiles[2].balancedMaxShaftRate)} units/min and level-1000 lift is ${fmt(report.liftProfiles[2].maxLiftRate)} units/min, or ${report.liftProfiles[2].liftHeadroomPercent.toFixed(2)}% structural headroom. All 1001 lift levels from 0 through 1000 were checked for finite, safe-integer magnitude for each exponential candidate.

## Lift pass ratios by scenario

The analytical envelope is soil 1.25 × weather 1.25 × buffs 1. This is the selected generator-fixture ceiling only, not a game-world limit. Seeded scenarios A/B are individual deterministic fixtures.

| Lift profile | Shaft-output scenario | Shaft output | Lift at level 1000 | Lift / shaft | Passes structural throughput |
|---|---|---:|---:|---:|---|
${comparisonRows}

The 1.0311 profile passes only the neutral case; its lift rate is ${fmt(report.liftProfiles[2].maxLiftRate)} units/min against the ${fmt(report.analyticalEnvelope.balancedMaxShaftUnitsPerMinute)} units/min analytical envelope. Growth 1.0316 produces ${fmt(report.liftProfiles.find((profile) => profile.growth === 1.0316).maxLiftRate)} units/min and has ${report.liftProfiles.find((profile) => profile.growth === 1.0316).scenarioComparisons.find((comparison) => comparison.scenario === report.analyticalEnvelope.label).liftToShaftRatio.toFixed(5)} lift/shaft ratio over that envelope (${report.liftProfiles.find((profile) => profile.growth === 1.0316).scenarioComparisons.find((comparison) => comparison.scenario === report.analyticalEnvelope.label).passesLiftThroughput ? 'passes' : 'fails'}). This recommends 1.0316 only as the provisional benchmark candidate for the next pipeline calibration, not as a certified global default.

### Optional shaft-depth sensitivity

| Label | Depth growth | Maximal shaft output (units/min) |
|---|---:|---:|
${report.depthSensitivity.map((row) => `| ${row.label} | ${row.depthGrowth} | ${fmt(row.balancedMaxShaftRate)} |`).join('\n')}

The depth-growth 2.0 row is a sensitivity only; 2.2 remains the documented study reference.

## Rate sweep

| Level | Shaft-one dig factor | Linear lift | Lift 1.03 | Lift 1.0311 | Lift 1.0316 | Lift 1.032 |
|---:|---:|---:|---:|---:|---:|---:|
${sweepRows}

## Seeded soil and weather fixtures

| Scenario | Soil modifier | Weather modifier | Early shaft output (units/min) | Max shaft output (units/min) |
|---|---:|---:|---:|---:|
${scenarioRows}

Each scenario also runs a 600-second shaft/lift/yard fixture with an explicit synthetic drain of 0.01 units/sec:

| Scenario | Mined | Buffer | Surface yard | Drain | Accounted | Physical | Residual |
|---|---:|---:|---:|---:|---:|---:|---:|
${report.scenarioRates.map((row) => `| ${row.label} | ${fmt(row.flowFixture.minedUnits)} | ${fmt(row.flowFixture.bufferUnits)} | ${fmt(row.flowFixture.surfaceUnits)} | ${fmt(row.flowFixture.drainedUnits)} | ${fmt(row.flowFixture.accountedUnits)} | ${fmt(row.flowFixture.conservedUnits)} | ${row.flowFixture.massBalanceResidualUnits.toExponential(2)} |`).join('\n')}

The seeded modifiers are deterministic sensitivity inputs, not a weather generator or probability calibration.

## Flow fixtures

The early fixture has one shaft at dig level 1, five assigned workers, cart level 0, and a 10-minute horizon. With the study inputs its shaft formula rate is ${early.fixtureRateUnitsPerMinute.toFixed(4)} units/min. The synthetic drain changes only how many units remain in the surface yard; it does not create a shipment or payment.

| Early 10-minute case | Mined | Buffer | Surface yard | Synthetic drain |
|---|---:|---:|---:|---:|
| No drain | ${fmt(early.tenMinuteNoDrain.minedUnits)} | ${fmt(early.tenMinuteNoDrain.bufferUnits)} | ${fmt(early.tenMinuteNoDrain.surfaceUnits)} | ${fmt(early.tenMinuteNoDrain.drainedUnits)} |
| Drain at 0.01 units/sec | ${fmt(early.tenMinuteSyntheticDrain.minedUnits)} | ${fmt(early.tenMinuteSyntheticDrain.bufferUnits)} | ${fmt(early.tenMinuteSyntheticDrain.surfaceUnits)} | ${fmt(early.tenMinuteSyntheticDrain.drainedUnits)} |

| Flow case | Mined | Buffer | Surface yard | Synthetic drain |
|---|---:|---:|---:|---:|
${caseRows}

The low-lift case shows shaft-buffer accumulation; the full-yard case blocks lift movement even at high lift level; the high-lift case uses all 30 explicitly assigned shafts and seven ore IDs. Buffer size, surface capacity, loading, fleet capacity, and synthetic drain rates are fixture values. In particular, no storage base is inferred from requiring the entire one-second production burst to fit in a buffer.

The largest observed floating-point mass residual across the summarized flow fixtures is ${report.massBalance.maxObservedAbsoluteResidualUnits.toExponential(3)} units. The helper checks each ore using the tolerance ${report.massBalance.acceptanceTolerance}. This is only a tiny floating-point residual in ore-unit fixtures; no coin is simulated, and coin remains subject to exact integer ledger accounting.

## Month horizon bookkeeping

| Month days | Horizon seconds | Preview ticks executed | Seconds remaining | Complete simulation |
|---:|---:|---:|---:|---|
${monthRows}

Only 60 ticks are executed for each horizon row. The remaining duration is carried forward; these rows are not completed month simulations.

## Interpretation and limits

The 1.0316 exponential lift curve is the **provisional benchmark candidate for the next pipeline calibration** because it clears the neutral, seeded and selected analytical-envelope comparisons. The earlier 1.0311 candidate clears only the neutral comparison. Neither result certifies economic balance or the complete pipeline. Linear surface storage, shaft buffers, loading rates, fleet limits, shipment timing, buyer budgets, prices, affordability targets, investment, and player strategies still need their own C-01 calibration. Worker counts are assigned explicitly; the habitat-wide miner pool, automatic worker allocation, and production UI are not integrated. No production values here create coin.

The JSON companion contains the full deterministic inputs and numeric results. No current time, stochastic process, production configuration write, or external service is used by the generator.
`;
}

const report = makeReport();
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'Production-Calibration.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(resolve(outputDir, 'Production-Calibration.md'), toMarkdown(report));
process.stdout.write('Generated deterministic production calibration JSON and Markdown.\n');
