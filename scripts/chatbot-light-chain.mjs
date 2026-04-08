/**
 * Allège le workflow chatbot (topologie + expressions If / Data Table).
 * Voir GUIDE_OPTIMISATION_N8N.md §7.
 */
const REMOVE_NAMES = new Set(['Code in JavaScript', 'Edit Fields']);

export function applyLightChain(workflow) {
  const hadPassThrough = workflow.nodes.some((n) => REMOVE_NAMES.has(n.name));
  workflow.nodes = workflow.nodes.filter((n) => !REMOVE_NAMES.has(n.name));

  const ifNode = workflow.nodes.find((n) => n.name === 'If');
  if (ifNode?.parameters?.conditions?.conditions) {
    for (const cond of ifNode.parameters.conditions.conditions) {
      if (typeof cond.leftValue === 'string') {
        cond.leftValue = cond.leftValue
          .replace(/\$\json\['Réponses'\]/g, '$json.output')
          .replace(/\$\json\["Réponses"\]/g, '$json.output');
      }
    }
  }

  const insert = workflow.nodes.find((n) => n.name === 'Insert row');
  if (insert?.parameters?.columns?.value) {
    insert.parameters.columns.value.reponse_chatbot =
      "={{ $('AI Agent').item.json.output }}";
  }

  const { connections } = workflow;
  delete connections['Code in JavaScript'];
  delete connections['Edit Fields'];

  connections['AI Agent'] = {
    main: [[{ node: 'If', type: 'main', index: 0 }]],
  };

  connections['If'] = {
    main: [
      [{ node: 'output', type: 'main', index: 0 }],
      [{ node: 'output1', type: 'main', index: 0 }],
    ],
  };

  connections['output'] = {
    main: [[{ node: 'Insert row', type: 'main', index: 0 }]],
  };

  connections['output1'] = {
    main: [[]],
  };

  connections['Insert row'] = {
    main: [[]],
  };

  return hadPassThrough;
}
