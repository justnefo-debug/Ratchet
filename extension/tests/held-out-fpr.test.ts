import { describe, it, expect } from 'vitest';
import { GazetteerRuleNerBackend } from '../src/detectors/gazetteer-ner-backend';

export const HELD_OUT_25_PROMPTS = [
  // 1. School Assignments (4)
  { id: 'S1', genre: 'School Assignment', text: 'Please summarize the main causes of the American Industrial Revolution, focusing on steam engine innovations and rail transit.' },
  { id: 'S2', genre: 'School Assignment', text: 'For tomorrow chemistry lab, calculate the molar mass of sodium chloride and describe the precipitation reaction.' },
  { id: 'S3', genre: 'School Assignment', text: 'Analyze how the author uses light and shadow as recurring metaphors throughout the second chapter of the novel.' },
  { id: 'S4', genre: 'School Assignment', text: 'Write a three-paragraph essay discussing how renewable energy subsidies influence household solar adoption rates.' },

  // 2. Customer Support (4)
  { id: 'U1', genre: 'Customer Support', text: 'I would like to inquire about the status of my order placed last Tuesday, as tracking indicates it is still awaiting courier dispatch.' },
  { id: 'U2', genre: 'Customer Support', text: 'Can you help me reset my account password? The verification link I received appears to be expired.' },
  { id: 'U3', genre: 'Customer Support', text: 'Our team would appreciate a billing receipt reflecting the applied annual discount for our cloud subscription.' },
  { id: 'U4', genre: 'Customer Support', text: 'The mobile app continues to close unexpectedly whenever I attempt to upload a profile banner image.' },

  // 3. Travel Plans (4)
  { id: 'T1', genre: 'Travel Plans', text: 'We are planning a five-day hiking trip through the mountain trails and need recommendations for lightweight tents.' },
  { id: 'T2', genre: 'Travel Plans', text: 'What is the most scenic train route along the coastal cliffs, and do we need advance seat reservations during peak season?' },
  { id: 'T3', genre: 'Travel Plans', text: 'Please recommend three family-friendly boutique hotels near the central marketplace with complimentary breakfast.' },
  { id: 'T4', genre: 'Travel Plans', text: 'Can you draft a packing checklist for a winter ski weekend including thermal base layers and waterproof gear?' },

  // 4. Sports (4)
  { id: 'P1', genre: 'Sports', text: 'The championship game went into double overtime before the visiting squad secured victory with a corner kick.' },
  { id: 'P2', genre: 'Sports', text: 'How has the introduction of automated strike zones impacted pitch framing strategies in professional baseball?' },
  { id: 'P3', genre: 'Sports', text: 'The marathon runner shattered the previous course record by pacing evenly through every intermediate split.' },
  { id: 'P4', genre: 'Sports', text: 'Our local cycling club is organizing a sixty-mile endurance ride this Saturday morning across rolling countryside hills.' },

  // 5. Health-Neutral How-To (4)
  { id: 'H1', genre: 'Health-Neutral How-To', text: 'How do I properly adjust the ergonomics of my office desk and monitor height to prevent neck stiffness during work hours?' },
  { id: 'H2', genre: 'Health-Neutral How-To', text: 'What are effective stretching routines to improve ankle mobility before beginning a morning jogging program?' },
  { id: 'H3', genre: 'Health-Neutral How-To', text: 'Can you provide simple breathing exercises designed to help unwind and transition to restful sleep at night?' },
  { id: 'H4', genre: 'Health-Neutral How-To', text: 'Explain how drinking adequate water throughout strenuous yard work supports natural thermal regulation and endurance.' },

  // 6. Job Ads (5)
  { id: 'J1', genre: 'Job Ads', text: 'We are seeking a senior backend software engineer with deep expertise in distributed databases, message queues, and Kubernetes.' },
  { id: 'J2', genre: 'Job Ads', text: 'Exciting opportunity for a creative graphic designer to lead brand identity, typography systems, and marketing collateral.' },
  { id: 'J3', genre: 'Job Ads', text: 'Growing logistics firm looking for a full-time warehouse inventory supervisor to manage dispatch logistics and fulfillment workflows.' },
  { id: 'J4', genre: 'Job Ads', text: 'Join our team as a technical customer success specialist providing enterprise onboarding and API integration support.' },
  { id: 'J5', genre: 'Job Ads', text: 'Now hiring a passionate junior copywriter to craft compelling newsletter content, product descriptions, and social announcements.' },
];

describe('Honest Evaluation on 25 Fresh Held-Out Ordinary Prose Prompts', () => {
  const backend = new GazetteerRuleNerBackend();

  it('runs 25 fresh prose prompts without detector tuning at low, medium, and high sensitivity', async () => {
    const levels = ['low', 'medium', 'high'] as const;

    console.log('\n========================================================================');
    console.log('HONEST EVALUATION ON 25 FRESH PROSE PROMPTS (NO DETECTOR TUNING)');
    console.log('========================================================================\n');

    for (const level of levels) {
      console.log(`\n────────────────────────────────────────────────────────────────────────`);
      console.log(`>>> SENSITIVITY: ${level.toUpperCase()}`);
      console.log(`────────────────────────────────────────────────────────────────────────`);

      let flaggedCount = 0;
      let totalFPs = 0;
      const flaggedPrompts: { id: string; genre: string; text: string; entities: string[] }[] = [];

      for (const p of HELD_OUT_25_PROMPTS) {
        const entities = await backend.detect(p.text, { sensitivity: level });
        if (entities.length > 0) {
          flaggedCount++;
          totalFPs += entities.length;
          flaggedPrompts.push({
            id: p.id,
            genre: p.genre,
            text: p.text,
            entities: entities.map(e => `[${e.type}: "${e.value}" at ${e.start}..${e.end}]`),
          });
        }
      }

      console.log(`Total Prompts: ${HELD_OUT_25_PROMPTS.length}`);
      console.log(`Prompts with False Positives: ${flaggedCount} / ${HELD_OUT_25_PROMPTS.length} (${((flaggedCount / HELD_OUT_25_PROMPTS.length) * 100).toFixed(1)}%)`);
      console.log(`Total False Positive Entity Hits: ${totalFPs}`);
      console.log('\nFlagged Items:');
      if (flaggedPrompts.length === 0) {
        console.log('  (None! 0 false positives)');
      } else {
        for (const fp of flaggedPrompts) {
          console.log(`  - [${fp.id}] (${fp.genre}): ${fp.entities.join(', ')}`);
          console.log(`    Text: "${fp.text}"`);
        }
      }
    }
  });
});
