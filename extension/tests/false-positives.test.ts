import { describe, it, expect } from 'vitest';
import { GazetteerRuleNerBackend } from '../src/detectors/gazetteer-ner-backend';

export const PROMPTS = [
  // 1. Emails
  { id: 'E1', cat: 'Email', text: 'Hi team, we will review the quarterly roadmap on Monday morning. Please mark your calendars and send any agenda items.' },
  { id: 'E2', cat: 'Email', text: 'Dear colleagues, thank you for handling the transition with grace under pressure. Best regards to everyone.' },
  { id: 'E3', cat: 'Email', text: 'Please make sure to pay the vendor bill before Friday so we do not incur late fees.' },
  { id: 'E4', cat: 'Email', text: 'I hope you are having a productive week. Let us schedule a quick call to align on priorities.' },
  { id: 'E5', cat: 'Email', text: 'Can you please send me the latest page of notes from yesterday sync?' },
  { id: 'E6', cat: 'Email', text: 'Do not chase every minor bug before the release; focus on the critical path.' },
  { id: 'E7', cat: 'Email', text: 'We need to set a realistic target for customer acquisition this quarter.' },
  { id: 'E8', cat: 'Email', text: 'Please grant read-only permissions to the audit team so they can review the compliance logs.' },

  // 2. Cover Letters
  { id: 'C1', cat: 'Cover Letter', text: 'As a young engineer with a passion for distributed systems, I am excited to apply for this role.' },
  { id: 'C2', cat: 'Cover Letter', text: 'I pride myself on clear communication and reading complex industry reports with precision.' },
  { id: 'C3', cat: 'Cover Letter', text: 'Throughout my career, I have consistently managed to deliver projects on time and under budget with grace.' },
  { id: 'C4', cat: 'Cover Letter', text: 'I have experience working across cross-functional teams to achieve organizational targets.' },
  { id: 'C5', cat: 'Cover Letter', text: 'My background includes managing large-scale operations and navigating complex visa regulations for overseas staff.' },
  { id: 'C6', cat: 'Cover Letter', text: 'I started early in my career developing web interfaces and modern backend microservices.' },
  { id: 'C7', cat: 'Cover Letter', text: 'In general, I prefer collaborative environments where developers can share feedback freely.' },
  { id: 'C8', cat: 'Cover Letter', text: 'My goal is to help your team innovate without having to chase short-term hype cycles.' },

  // 3. Coding Help
  { id: 'K1', cat: 'Coding Help', text: 'How do I configure meta tags in Next.js to optimize page previews on social platforms?' },
  { id: 'K2', cat: 'Coding Help', text: 'In JavaScript, will Array.prototype.map maintain insertion order across all modern browsers?' },
  { id: 'K3', cat: 'Coding Help', text: 'How can I mark a TypeScript property as optional while enforcing strict null checks?' },
  { id: 'K4', cat: 'Coding Help', text: 'When designing this API, should we use a long timeout or fail fast with an error code?' },
  { id: 'K5', cat: 'Coding Help', text: 'Can you explain how the builder pattern provides a clean way to construct complex objects?' },
  { id: 'K6', cat: 'Coding Help', text: 'How do I calculate the price elasticity in Python using Pandas dataframe calculations?' },
  { id: 'K7', cat: 'Coding Help', text: 'In React, how do I prevent child components from re-rendering when parent state changes?' },
  { id: 'K8', cat: 'Coding Help', text: 'What is the best way to cross-compile a Go binary for Linux ARM64 from macOS?' },

  // 4. Recipes
  { id: 'R1', cat: 'Recipe', text: 'To make the tart, peel and slice one crisp green apple into thin wedges.' },
  { id: 'R2', cat: 'Recipe', text: 'Squeeze the juice of one fresh orange into the marinade to balance the acidity.' },
  { id: 'R3', cat: 'Recipe', text: 'Heat a tablespoon of olive oil in a pan and cook the diced onions until translucent.' },
  { id: 'R4', cat: 'Recipe', text: 'Combine brown sugar, cinnamon, and a pinch of salt in a small mixing bowl.' },
  { id: 'R5', cat: 'Recipe', text: 'Simmer the sauce over low heat until it thickens, stirring gently with a wooden spoon.' },
  { id: 'R6', cat: 'Recipe', text: 'Serve the grilled salmon over a bed of steamed white rice and fresh greens.' },
  { id: 'R7', cat: 'Recipe', text: 'Garnish the finished dessert with candied rose petals and crushed pistachios.' },
  { id: 'R8', cat: 'Recipe', text: 'Bake the sourdough loaf on a preheated baking stone at 450 degrees Fahrenheit.' },

  // 5. News Summaries
  { id: 'N1', cat: 'News Summary', text: 'The central bank signaled that interest rates will remain unchanged through the end of the year.' },
  { id: 'N2', cat: 'News Summary', text: 'Consumer prices rose modestly last month as supply chain pressures began to ease.' },
  { id: 'N3', cat: 'News Summary', text: 'The tech sector saw mixed results as semiconductor firms exceeded their quarterly target.' },
  { id: 'N4', cat: 'News Summary', text: 'Several consumers reported that they intend to sue the airline over unrefunded flight cancellations.' },
  { id: 'N5', cat: 'News Summary', text: 'The historic church bell was restored after months of community fundraising.' },
  { id: 'N6', cat: 'News Summary', text: 'Tourists were advised to check entry and tourist visa guidelines prior to booking international flights.' },
  { id: 'N7', cat: 'News Summary', text: 'Local authorities warned residents not to ford the swollen river following heavy rainfall.' },
  { id: 'N8', cat: 'News Summary', text: 'Economic indicators suggest a steady recovery across both heavy industry and consumer retail.' },
];

describe('False Positives Audit on 40 Ordinary Prose Prompts', () => {
  const backend = new GazetteerRuleNerBackend();

  it('evaluates false positive rates at low, medium, and high sensitivity', async () => {
    const levels = ['low', 'medium', 'high'] as const;

    console.log('\n========================================================================');
    console.log('EVALUATION OF 40 ORDINARY PROSE PROMPTS (NO PERSONAL DATA)');
    console.log('========================================================================\n');

    for (const level of levels) {
      console.log(`\n────────────────────────────────────────────────────────────────────────`);
      console.log(`>>> SENSITIVITY: ${level.toUpperCase()}`);
      console.log(`────────────────────────────────────────────────────────────────────────`);

      let flaggedCount = 0;
      let totalFPs = 0;
      const flaggedPrompts: { id: string; cat: string; text: string; entities: string[] }[] = [];

      for (const p of PROMPTS) {
        const entities = await backend.detect(p.text, { sensitivity: level });
        if (entities.length > 0) {
          flaggedCount++;
          totalFPs += entities.length;
          flaggedPrompts.push({
            id: p.id,
            cat: p.cat,
            text: p.text,
            entities: entities.map(e => `[${e.type}: "${e.value}" at ${e.start}..${e.end}]`),
          });
        }
      }

      console.log(`Total Prompts: ${PROMPTS.length}`);
      console.log(`Prompts with False Positives: ${flaggedCount} / ${PROMPTS.length} (${((flaggedCount / PROMPTS.length) * 100).toFixed(1)}%)`);
      console.log(`Total False Positive Entity Hits: ${totalFPs}`);
      console.log('\nDetailed False Positives:');
      if (flaggedPrompts.length === 0) {
        console.log('  (None! 0 false positives)');
      } else {
        for (const fp of flaggedPrompts) {
          console.log(`  - [${fp.id}] (${fp.cat}): ${fp.entities.join(', ')}`);
          console.log(`    Text: "${fp.text}"`);
        }
      }

      // Assert zero false positives across all 40 prompts at all sensitivity levels
      expect(flaggedCount, `Expected 0 false positives at sensitivity ${level}, got ${flaggedCount}`).toBe(0);
      expect(totalFPs).toBe(0);
    }
  });

  it('correctly detects ambiguous words when provided with valid entity context', async () => {
    const text1 = 'Dr. Mark met Grace Hopper at Target Corp in Reading.';
    const res1 = await backend.detect(text1, { sensitivity: 'medium' });

    expect(res1.some(e => e.type === 'PERSON' && e.value === 'Mark')).toBe(true);
    expect(res1.some(e => e.type === 'PERSON' && e.value === 'Grace Hopper')).toBe(true);
    expect(res1.some(e => e.type === 'ORG' && e.value.includes('Target'))).toBe(true);
    expect(res1.some(e => e.type === 'LOCATION' && e.value === 'Reading')).toBe(true);

    const text2 = 'He worked at Target, bought Apple Inc. stock, and paid with Visa.';
    const res2 = await backend.detect(text2, { sensitivity: 'medium' });

    expect(res2.some(e => e.type === 'ORG' && e.value === 'Target')).toBe(true);
    expect(res2.some(e => e.type === 'ORG' && e.value.includes('Apple'))).toBe(true);
    expect(res2.some(e => e.type === 'ORG' && e.value === 'Visa')).toBe(true);
  });
});
