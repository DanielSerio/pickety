import * as assert from "assert";
import { ImportGraph } from "../../core/graph";
import { findCycles } from "../../core/utils";
import { normalizePath } from "../../core/utils";

suite("ImportGraph", () => {
  let graph: ImportGraph;

  setup(() => {
    graph = new ImportGraph();
  });

  test("tracks direct dependencies", () => {
    graph.updateFile("A", new Set(["B", "C"]));
    assert.deepStrictEqual([...graph.getDependencies("A")].sort(), ["B", "C"]);
    assert.deepStrictEqual([...graph.getDependents("B")], ["A"]);
    assert.deepStrictEqual([...graph.getDependents("C")], ["A"]);
  });

  test("updates dependencies correctly", () => {
    graph.updateFile("A", new Set(["B", "C"]));
    graph.updateFile("A", new Set(["B", "D"]));
    assert.deepStrictEqual([...graph.getDependencies("A")].sort(), ["B", "D"]);
    assert.deepStrictEqual([...graph.getDependents("B")], ["A"]);
    assert.deepStrictEqual([...graph.getDependents("C")], []);
    assert.deepStrictEqual([...graph.getDependents("D")], ["A"]);
  });

  test("removes files and their edges", () => {
    graph.updateFile("A", new Set(["B"]));
    graph.updateFile("C", new Set(["A"]));
    graph.removeFile("A");

    assert.deepStrictEqual([...graph.getDependencies("A")], []);
    assert.deepStrictEqual([...graph.getDependents("A")], []);
    assert.deepStrictEqual([...graph.getDependents("B")], []);
    assert.deepStrictEqual([...graph.getDependencies("C")], []);
  });

  test("computes transitive dependents (BFS)", () => {
    // D -> C -> B -> A
    // E -> B
    graph.updateFile("A", new Set());
    graph.updateFile("B", new Set(["A"]));
    graph.updateFile("C", new Set(["B"]));
    graph.updateFile("D", new Set(["C"]));
    graph.updateFile("E", new Set(["B"]));

    const trans = graph.getTransitiveDependents("A");
    assert.strictEqual(trans.size, 4);
    assert.ok(trans.has("B"));
    assert.ok(trans.has("C"));
    assert.ok(trans.has("D"));
    assert.ok(trans.has("E"));
  });

  test("getTransitiveDependents handles cycles safely", () => {
    // A <-> B
    graph.updateFile("A", new Set(["B"]));
    graph.updateFile("B", new Set(["A"]));

    const transA = graph.getTransitiveDependents("A");
    assert.strictEqual(transA.size, 1);
    assert.ok(transA.has("B"));

    const transB = graph.getTransitiveDependents("B");
    assert.strictEqual(transB.size, 1);
    assert.ok(transB.has("A"));
  });

  test("getModuleLevelGraph aggregates file edges", () => {
    const modules = {
      "feat/A": "src/feat/A/*",
      "feat/B": "src/feat/B/*",
    };
    const root = normalizePath("/root");

    // File edges
    graph.updateFile(normalizePath("/root/src/feat/A/one.ts"), new Set([normalizePath("/root/src/feat/B/two.ts")]));
    graph.updateFile(normalizePath("/root/src/feat/A/three.ts"), new Set([normalizePath("/root/src/feat/B/four.ts")]));

    const modGraph = graph.getModuleLevelGraph(modules, root);
    assert.strictEqual(modGraph.size, 1);
    assert.ok(modGraph.has("feat/A"));
    assert.deepStrictEqual([...modGraph.get("feat/A")!], ["feat/B"]);
  });
});

suite("findCycles", () => {
  test("finds a simple cycle", () => {
    const graph = new Map<string, Set<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["C"])],
      ["C", new Set(["A"])],
    ]);
    const cycles = findCycles(graph);
    assert.strictEqual(cycles.length, 1);
    assert.deepStrictEqual(cycles[0], ["A", "B", "C", "A"]);
  });

  test("finds multiple cycles", () => {
    const graph = new Map<string, Set<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["A", "C"])],
      ["C", new Set(["B"])],
    ]);
    const cycles = findCycles(graph);
    // Depending on DFS order, could be [[A, B, A], [B, C, B]] or similar
    assert.ok(cycles.length >= 2);
  });

  test("returns empty for DAG", () => {
    const graph = new Map<string, Set<string>>([
      ["A", new Set(["B", "C"])],
      ["B", new Set(["C"])],
      ["C", new Set([])],
    ]);
    const cycles = findCycles(graph);
    assert.strictEqual(cycles.length, 0);
  });
});
