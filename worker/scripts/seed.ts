/**
 * Local development seed.
 *
 *     npm run db:migrate:local && npm run seed:local
 *
 * Populates the local D1 database with published answers across every category,
 * a couple of unanswered conversations for the counselor inbox, and prayer
 * requests — enough that the frontend has something real to render.
 *
 * Two things this script deliberately does not do:
 *
 *   • It does not create an administrator. The first admin is bootstrapped from
 *     `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` on first sign-in, and
 *     seeding one would bypass that guard and leave a known password behind.
 *   • It does not touch a remote database. Every statement is applied with
 *     `--local` only.
 *
 * Ids are assigned explicitly so `public_slug` can carry the same
 * `{title}-{base36(id)}` shape the application generates, and the table is
 * cleared first so the script is re-runnable.
 */

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "../../shared/site";

const DATABASE = "graceline-db";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

type Seed = {
  category: string;
  publicTitle: string;
  publicContent: string;
  publicAnswer: string;
  /** Days ago. Spaces the archive out so ordering is visibly correct. */
  ageDays: number;
};

const PUBLISHED: Seed[] = [
  {
    category: "Anxiety",
    ageDays: 2,
    publicTitle: "Why does God feel silent when I am anxious?",
    publicContent:
      "I have prayed every night for months about the anxiety I carry, and it has not lifted. I keep wondering whether God is actually listening, or whether I am just talking to myself.",
    publicAnswer:
      "Silence is not the same as absence, though it rarely feels that way from the inside.\n\nWhen Elijah asked to die under a broom tree, God did not begin with a sermon. He sent an angel to let him sleep and to feed him. Only after that did God speak, and then not in the earthquake or the fire but in a gentle whisper. The order matters: care for the body first, then the word.\n\nAnxiety is not a failure of faith. It is often a signal that you are carrying more than one person was meant to carry alone. Bringing it to God is not a sign that your prayer life is weak — it is the prayer.\n\nTwo practical things. First, tell someone who is actually present: a pastor, a counselor, a trusted friend. Faith was never meant to be carried in isolation. Second, if the anxiety is persistent and physical, please speak to a doctor. There is no conflict between trusting God and accepting treatment; both can be grace.\n\nKeep praying. You are heard even on the nights it does not feel so.",
  },
  {
    category: "Faith Crisis",
    ageDays: 5,
    publicTitle: "I have stopped believing, and I feel like a fraud",
    publicContent:
      "I grew up in church and led a small group for years. Somewhere along the way the doubts became bigger than the belief, and now I go through the motions. I have not told anyone.",
    publicAnswer:
      "Thank you for writing this down. What you have described is more common among people who lead than anyone admits out loud.\n\nDoubt is not the opposite of faith; indifference is. The person who has truly walked away stops asking. The fact that the loss grieves you says something important about what you once held.\n\nThe psalms are full of people saying exactly what you are saying. \"How long, O Lord? Will you forget me forever?\" That prayer is in Scripture because God can bear the honest version of us. He does not need the tidy one.\n\nI would gently separate two things that are probably tangled: the beliefs you are no longer sure of, and the community you are performing for. You may need to step back from leading for a season without stepping away from God. That is not hypocrisy — it is honesty, and it protects the people you lead.\n\nFind one person you can be unguarded with. Not the whole group. One. That is usually where faith is rebuilt, if it is rebuilt.",
  },
  {
    category: "Grief",
    ageDays: 8,
    publicTitle: "How do I grieve someone I had a difficult relationship with?",
    publicContent:
      "My father died last month. We were estranged for most of my adult life. People keep telling me he loved me, and I feel nothing but confusion. I do not know what I am supposed to feel.",
    publicAnswer:
      "There is no correct feeling here, and no timetable.\n\nGrieving someone who hurt you is genuinely harder than grieving someone who was simply loved. You are mourning both the person and the relationship you never had, and the second loss has no funeral.\n\nThe platitudes you are hearing — that he loved you, that he meant well — are usually people trying to make their own discomfort stop. You do not have to accept them to be a faithful person, and you do not have to resolve how you feel about him in order to grieve.\n\nScripture is remarkably unsentimental about broken families. Joseph's relationship with his brothers was never fully repaired, even after reconciliation. David mourned a son who had tried to kill him. The Bible does not pretend these things get clean.\n\nGive yourself permission to feel contradictory things at once. Relief and sorrow can be true in the same hour. Consider speaking with a grief counselor who understands complicated loss — this is exactly the situation that kind of support is for.",
  },
  {
    category: "Marriage",
    ageDays: 11,
    publicTitle: "We are Christians and our marriage is failing",
    publicContent:
      "My husband and I have been married nine years. We pray together but we cannot stop fighting. I feel ashamed because we are supposed to be a witness to other couples.",
    publicAnswer:
      "The shame you are describing is doing more damage than the fighting, so let me address it first.\n\nThere is no version of Christian marriage in which two imperfect people stop struggling. What makes a marriage a witness is not the absence of conflict — it is how the conflict gets repaired. A couple who fight and repair honestly is a far truer picture of grace than one who performs peace.\n\nPraying together is good, and it is not sufficient on its own. Conflict patterns are skills, and skills can be learned. What you are describing — a cycle neither of you can stop — is precisely what marriage counseling is designed for, and seeking it is an act of faithfulness, not a failure of it.\n\nIf there is any contempt, stonewalling, or one of you withdrawing completely, please do not wait. Those patterns harden over time.\n\nAnd if there is any abuse in the marriage — including emotional or financial control — that is a different situation entirely, and safety comes before reconciliation. Please tell a counselor or a trusted pastor directly.\n\nYou are not a bad witness. You are two people trying honestly, which is the only kind there is.",
  },
  {
    category: "Prayer",
    ageDays: 14,
    publicTitle: "How do I pray when I have no words?",
    publicContent:
      "I sit down to pray and my mind is empty. I repeat the same few sentences and feel like I am wasting time. Is there a way to pray that does not require eloquence?",
    publicAnswer:
      "Yes, and you are closer to it than you think.\n\nPaul addresses this exact problem directly: \"We do not know what we ought to pray for, but the Spirit himself intercedes for us through wordless groans.\" The assumption in that verse is that not knowing what to say is the normal state, not the failure state.\n\nA few practices that help when words will not come:\n\nPray Scripture back. Read a psalm slowly and let it be your words. You are not required to compose; you are permitted to borrow.\n\nSit in silence deliberately. Set five minutes, say nothing, and simply remain present. It will feel unproductive. That is not evidence it is not working.\n\nPray while doing something else. Walking, washing dishes, commuting. The idea that prayer requires stillness and folded hands is a cultural inheritance, not a biblical one.\n\nKeep it short and repeat it. \"Lord, have mercy\" is a complete prayer. So is \"Help.\"\n\nThe measure of prayer is not eloquence or length. It is that you turned toward God rather than away.",
  },
  {
    category: "Bible Interpretation",
    ageDays: 18,
    publicTitle: "How do I read Old Testament passages that seem cruel?",
    publicContent:
      "I was reading Joshua and some of the psalms and I could not reconcile what I was reading with the God Jesus describes. I closed the Bible and have not opened it since.",
    publicAnswer:
      "This is a serious question and it deserves a serious answer rather than a reassurance.\n\nFirst: you are not the first, and the discomfort you felt is a sign you are reading attentively rather than carelessly. Plenty of faithful readers across two thousand years have stopped where you stopped.\n\nA few things genuinely help.\n\nRead the whole book, not the verse. Ancient Near Eastern war language was frequently conventional and rhetorical — the same boasts appear in Egyptian and Assyrian records about battles that plainly did not exterminate anyone. That does not dissolve the difficulty, but it changes what the text is doing.\n\nNotice what the Bible does with its own hard texts. The psalms of vengeance are prayers, not instructions; they hand rage to God rather than acting on it. Scripture regularly records what it does not endorse.\n\nLet the difficult parts drive you to the clearer ones rather than away from them. If you want to know what God is like, the New Testament's own answer is unambiguous: \"Anyone who has seen me has seen the Father.\"\n\nI would encourage you to open it again — but start in Luke or John rather than Joshua, and read it in a larger chunk so context can do its work.\n\nDo not read alone if it keeps troubling you. A good commentary or a thoughtful conversation partner makes an enormous difference here.",
  },
  {
    category: "Depression",
    ageDays: 21,
    publicTitle: "Is depression a sin? I cannot feel God at all",
    publicContent:
      "My pastor told me I need to have more joy. I have not been able to feel anything for a year, including in worship. I am afraid this means I have turned away from God.",
    publicAnswer:
      "Depression is not a sin, and the absence of feeling is not the absence of faith.\n\nI want to be direct about the advice you were given: telling someone with depression to have more joy is like telling someone with a broken leg to walk it off. It is not biblical, it is not helpful, and it is not what Scripture does with people who cannot feel glad.\n\nConsider Elijah, who asked to die. Consider Job, who cursed the day of his birth. Consider Jesus in Gethsemane, \"overwhelmed with sorrow to the point of death.\" None of these were rebuked for the feeling.\n\nDepression frequently has physical causes and physical treatments, and using them is no more a failure of faith than wearing glasses is a failure of trust in God's design for eyes. If you have not seen a doctor, please do. If you are already under care, please keep going.\n\nOn the feeling of God's absence: faith that persists when feeling is gone is not weaker faith. It may be the strongest kind there is. You are still asking the question, which tells me you have not turned away.\n\nOne more thing, and please take it seriously. If you have thoughts of harming yourself, contact a crisis line or your local emergency number now, and tell someone you trust today. You do not have to wait for this to feel urgent enough.",
  },
  {
    category: "Forgiveness",
    ageDays: 26,
    publicTitle: "Do I have to forgive someone who is still harming me?",
    publicContent:
      "People keep quoting the verse about forgiving seventy times seven. The person who hurt me has never apologised and is still in my life. I feel trapped between obedience and self-protection.",
    publicAnswer:
      "You are not trapped, and these two things are not in conflict.\n\nForgiveness and reconciliation are often treated as one act. They are not. Forgiveness is something you can do alone; it is releasing the debt and handing the justice to God. Reconciliation requires two people, and it requires the other person to change. You can only do your half.\n\nSo the honest answer is: you can be commanded to forgive and still be entirely right to keep your distance.\n\nScripture holds both. \"If it is possible, as far as it depends on you, live at peace with everyone\" — note the conditions built into that sentence. And elsewhere the instruction to shake the dust off your feet, which is not a grudge; it is a boundary.\n\nForgiveness also rarely happens once. It is more often a decision you make repeatedly as the memory returns. That is not failure; that is what it looks like in practice.\n\nIf this person is currently causing harm — particularly if there is abuse of any kind — please prioritise your safety and speak with someone who can help you plan. Forgiveness is never a reason to stay in a dangerous situation.\n\nYou are not disobeying God by protecting yourself.",
  },
  {
    category: "Parenting",
    ageDays: 30,
    publicTitle: "My teenager has left the faith and it is breaking me",
    publicContent:
      "Our son is nineteen and has told us he does not believe anymore. He will not come to church and gets angry when we bring it up. I pray constantly and nothing changes.",
    publicAnswer:
      "This is one of the most painful things a believing parent goes through, and the instinct to fix it usually makes it harder.\n\nA few things worth separating.\n\nHis rejection is probably not of God. Nineteen-year-olds who leave often leave a version of faith that stopped making sense to them, or a community where their questions were not welcome. That is not the same as leaving God, even though it feels identical from the outside.\n\nThe relationship is the only channel you have left, and it is worth more than any argument. Every conversation that becomes a debate closes it a little. Every conversation where he feels genuinely heard keeps it open.\n\nSo: stop raising it, and do not stop loving him. Ask about his life. Let him see that your affection is not conditional on his belief. That is the most credible apologetic available to you right now.\n\nYour prayers are not wasted because they have not produced the outcome you asked for. Pray for him, and also pray for your own peace — you are carrying this too.\n\nMany people return. Some return at thirty, some at fifty, and they return to the parents who kept the door open. That is the part that is actually in your hands.",
  },
  {
    category: "Salvation",
    ageDays: 34,
    publicTitle: "How do I know I am really saved?",
    publicContent:
      "I said a prayer years ago but I still doubt constantly. I keep wondering whether I meant it enough, and whether that means it did not count.",
    publicAnswer:
      "The question you are asking is one that a great many sincere believers ask, and the answer is not what most people expect.\n\nAssurance does not usually come from examining the quality of your own sincerity. If it did, no one would ever have it — because the more honestly you look, the more mixed motives you find. That is not a defect in you; it is the normal condition of a human heart.\n\nThe object of faith matters more than the strength of it. A trembling hand on a solid rail holds just as firmly as a confident one.\n\nSo the question is not \"did I mean it enough?\" but \"what am I relying on?\" If you are relying on what Christ did rather than on the quality of your own performance, then you are relying on something that does not fluctuate with your mood.\n\nConstant doubt is also frequently a sign of scrupulosity rather than unbelief — a mind that keeps re-litigating a settled matter because it cannot tolerate uncertainty. If that sounds like you, it is worth knowing that this is a recognised pattern, and talking to a counselor about it can help more than more theological argument.\n\nYou are not disqualified by doubting. You are in the company of the man who said, \"I do believe; help me overcome my unbelief\" — and Christ did not turn him away for the second half of that sentence.",
  },
  {
    category: "Youth",
    ageDays: 38,
    publicTitle: "Everyone at my church seems certain and I am not",
    publicContent:
      "I am seventeen and in youth group. Everyone talks about hearing from God so clearly and I have never felt anything like that. I have started pretending so I fit in.",
    publicAnswer:
      "Let me tell you something that will probably be a relief: most of them are performing too.\n\nYouth groups are one of the most socially intense environments a teenager can be in, and the language people use in them tends to inflate. When everyone around you describes dramatic experiences, the honest thing to say — \"I have not felt much\" — starts to sound like a confession of failure. It is not. It is just true, and it is true of far more people than you would guess.\n\nTwo things I would say to you directly.\n\nFirst, stop pretending. Not by announcing your doubts in the middle of a service, but by finding one person — a youth leader you trust, an older believer, a parent — and being honest with them. Carrying a performance is exhausting, and it isolates you from the very people who could help.\n\nSecond, do not measure your faith against other people's descriptions of theirs. You are comparing your internal reality to their external presentation. That comparison is rigged, and it will make you despair no matter how your faith is actually doing.\n\nGod is not alarmed by your uncertainty. He is far more interested in your honesty than in your confidence.\n\nAnd if it helps: some of the most faithful people I know spent their teenage years feeling exactly as you do now.",
  },
  {
    category: "Work & Purpose",
    ageDays: 42,
    publicTitle: "How do I know what God wants me to do with my life?",
    publicContent:
      "I am twenty-six and feel behind. Friends are getting married, being ordained, going into missions. I am in an ordinary job and I cannot tell whether that is where I am meant to be.",
    publicAnswer:
      "The question assumes that God has one specific slot reserved for you and that missing it will cost you. That is a very common way to think, and it is a heavier burden than Scripture actually places on anyone.\n\nWhat the Bible consistently asks for is faithfulness in what is in front of you, not certainty about what comes next. \"Whatever you do, work at it with all your heart.\" There is no footnote exempting ordinary work.\n\nOrdinary work is not the waiting room for a real calling. Most of the people Scripture calls were doing something unremarkable when it happened — shepherding, fishing, collecting taxes. The work was not the preparation; it was the context.\n\nIf you genuinely want direction, three things are more useful than waiting for a sign. What are you actually good at? What do people around you need? And where do those two overlap with something you can sustain? That is a real discernment process, not a compromise with God's will.\n\nOn feeling behind: you are comparing your chapter two to other people's chapter seven. Some of the ordinations and weddings you are admiring will turn out to have been premature. You cannot see that from here, and you do not need to.\n\nYou are not late. You are where you are, and that is a legitimate place to serve God.",
  },
  {
    category: "Anxiety",
    ageDays: 23,
    publicTitle: "I wake at 3am and cannot stop the racing thoughts",
    publicContent:
      "Almost every night I wake around three and my mind starts running through everything I have done wrong. By the time I get up I am exhausted. Prayer has not helped and I feel guilty about that.",
    publicAnswer:
      "The 3am wake-up is so common it has become almost a cliché, and there is a reason for that: it is a physiological event as much as a spiritual one. Cortisol rises in the small hours, and a tired brain does its worst thinking then. What feels like a moral crisis at 3am frequently reads very differently at 9am in daylight.\n\nThat is worth holding onto, because it changes what you are actually dealing with. You are not being attacked by your own conscience in a way that requires a theological answer. You are awake, alone, and tired.\n\nSome things that help, and none of them require you to feel more faithful than you do.\n\nGet out of bed. Lying there rehearsing trains your brain that the bed is where worrying happens. Move to another room, keep the light low, and do something undemanding until you are sleepy.\n\nWrite the list down. The thoughts loop because the brain is afraid of forgetting them. Putting them on paper tells it that it can stop holding on.\n\nPray badly. You do not need eloquence at 3am. \"I cannot do this tonight\" is a complete prayer, and it is an honest one.\n\nOn the guilt: prayer not producing immediate relief is not evidence that you prayed wrongly. If this pattern has gone on for weeks and is affecting your days, please speak to a doctor. Persistent early-morning waking is a recognised symptom worth being assessed, and treating it is not a lack of trust in God.",
  },
  {
    category: "Anxiety",
    ageDays: 40,
    publicTitle: "Is it wrong to take medication for anxiety?",
    publicContent:
      "Someone in my small group said anxiety is a spiritual problem and that medication is a way of avoiding God. I have been on medication for two years and it has helped enormously, but now I feel like I am cheating.",
    publicAnswer:
      "You are not cheating, and I would like to push back gently but clearly on what you were told.\n\nAnxiety is not exclusively a spiritual problem. It has genetic, neurological and physiological components, exactly as diabetes and asthma do. Nobody in your small group would tell a diabetic that insulin is a way of avoiding God.\n\nThe comparison is not rhetorical. If we accept that God created bodies and that bodies sometimes malfunction, then treating the malfunction is cooperation with creation rather than rebellion against it. Wearing glasses does not mean you distrust God\u2019s design for eyes.\n\nScripture itself is comfortable with physical remedies. Paul tells Timothy to take wine for his stomach. The good Samaritan pours oil and wine into wounds. There is no biblical principle that treatment must be non-physical to count as faithful.\n\nWhat may have happened in your group is a conflation of two different things: anxiety as a spiritual experience, which is real, and anxiety as a medical condition, which is also real. They can be true at once, and addressing one does not negate the other.\n\nPlease keep taking your medication as prescribed, and please do not stop or change it without speaking to your doctor. If you would like a faith perspective that takes both seriously, I would be glad to point you toward a counselor who holds both together.",
  },
  {
    category: "Prayer",
    ageDays: 29,
    publicTitle: "Does God answer prayers that go against what I asked for?",
    publicContent:
      "I prayed for two years that a relationship would work out. It did not. I am trying to accept that this was God\u2019s answer but it feels like being told my prayers did not matter.",
    publicAnswer:
      "Your prayers mattered, and I want to separate two ideas that grief tends to fuse together.\n\nThe first is that prayer changes things. The second is that prayer is a mechanism for getting what you asked for. Only the first is true.\n\nIf prayer worked by producing requested outcomes, it would be a transaction, and the person praying hardest would always get the most. That is not what Scripture describes and it is certainly not what anyone\u2019s experience bears out. Jesus prayed in Gethsemane that the cup would pass, and it did not.\n\nSo a \"no\" is not evidence that your prayers were unheard. It is a different answer to a different question than the one you were asking. You were asking for a particular outcome; what prayer was doing in you over those two years is not the same thing, and it is not nothing.\n\nThat said, I do not want to offer you a tidy spiritual explanation for a loss. Losing something you prayed for is a genuine grief, and it is compounded by the feeling that you were foolish to hope. You were not foolish. Hoping was the right thing to do.\n\nGive yourself time. The theological questions can wait until the grief has had some room.",
  },
  {
    category: "Grief",
    ageDays: 36,
    publicTitle: "Everyone expects me to be over it by now",
    publicContent:
      "My husband died fourteen months ago. People at church have stopped asking and some seem uncomfortable when I mention him. I feel like I am grieving wrong because it has not gone away.",
    publicAnswer:
      "You are not grieving wrong. There is no version of this that is going away on a schedule, and fourteen months is not a long time.\n\nWhat you are noticing in other people is real, and it is worth naming: most people are not uncomfortable with your grief, they are uncomfortable with their own helplessness. They do not know what to say, so they say nothing, and the silence lands on you as disapproval. It almost certainly is not.\n\nGrief does not shrink so much as your life grows around it. The loss stays the same size; you become more able to carry it. That means the sadness will still arrive, sometimes out of nowhere, years from now. That is not a setback.\n\nA few things that may help.\n\nSay his name, and keep saying it. Some people avoid it because they fear reminding you. You have not forgotten. Hearing his name is usually a gift, not a wound.\n\nFind the people who can sit in it. Usually one or two, not a group. Tell them plainly what you need: \"I do not need advice, I need twenty minutes.\"\n\nConsider a grief group. Not because something is wrong with you, but because being in a room where nobody flinches is a relief you have probably not had in months.\n\nAnd if the grief becomes something you cannot function inside, please tell a doctor. That is different from grieving badly, and it is treatable.",
  },
];

/** Unanswered conversations, so the counselor console has a working queue. */
const PENDING: { category: string; title: string; content: string; urgent?: boolean }[] = [
  {
    category: "Anxiety",
    title: "I cannot stop checking whether I have sinned",
    content:
      "Every night I go back over the whole day trying to remember anything I did wrong. If I cannot remember clearly I panic. It takes hours and I am exhausted. I have not told anyone at church.",
  },
  {
    category: "Marriage",
    title: "My spouse will not go to counseling with me",
    content:
      "I have asked several times and he says we do not need a stranger involved. I have started going alone. I do not know how much longer I can keep doing this by myself.",
  },
  {
    category: "Grief",
    title: "I lost our baby in March",
    content:
      "People at church keep saying God needed another angel and I know they mean it kindly but it makes me angry at him. I do not know if I am allowed to be angry.",
    urgent: true,
  },
];

const PRAYERS: { title: string; content: string; count: number; ageDays: number }[] = [
  {
    title: "For my mother's surgery on Thursday",
    content: "She is frightened and so am I. Please pray she has peace going in, and that the surgeons have steady hands.",
    count: 34,
    ageDays: 1,
  },
  {
    title: "Six months without work",
    content: "Interviews keep going nowhere and we are running out of savings. Praying for provision and for the courage to keep going.",
    count: 58,
    ageDays: 3,
  },
  {
    title: "My brother has not spoken to me in four years",
    content: "After our father died we stopped speaking. I have written twice. Please pray for a way back to each other.",
    count: 21,
    ageDays: 5,
  },
  {
    title: "Starting university away from home and my church",
    content: "I am excited but terrified of drifting. Please pray I find a community that will hold me accountable kindly.",
    count: 47,
    ageDays: 6,
  },
  {
    title: "For the family in our street who lost their house",
    content: "The fire took everything on Tuesday. They have three children under ten. Praying for shelter and for neighbours who show up.",
    count: 92,
    ageDays: 8,
  },
];

function sqlEscape(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function statements(): string[] {
  const now = Date.now();
  const day = 86_400_000;
  const out: string[] = [];

  // Re-runnable: clear the tables the seed owns.
  out.push(
    "DELETE FROM questions;",
    "DELETE FROM prayer_requests;",
    "DELETE FROM messages;",
    "DELETE FROM internal_notes;",
    "DELETE FROM sqlite_sequence WHERE name IN ('questions','prayer_requests','messages','internal_notes');",
  );

  // Published answers. Ids are explicit so the slug matches the application's
  // `{title}-{base36(id)}` format exactly.
  PUBLISHED.forEach((seed, index) => {
    const id = index + 1;
    const slug = `${slugify(seed.publicTitle)}-${id.toString(36)}`;
    const createdAt = now - seed.ageDays * day;
    out.push(
      `INSERT INTO questions (id, tracking_token, seeker_email, category, raw_title, raw_content,` +
        ` public_title, public_content, public_answer, public_slug, is_public, published_at,` +
        ` status, is_urgent, created_at, updated_at, last_message_at, seeker_read_at, counselor_read_at)` +
        ` VALUES (${id}, ${sqlEscape(`seed-${id.toString(36)}-published`)}, NULL, ${sqlEscape(seed.category)},` +
        ` ${sqlEscape(`[seed] ${seed.publicTitle}`)}, ${sqlEscape(seed.publicContent)},` +
        ` ${sqlEscape(seed.publicTitle)}, ${sqlEscape(seed.publicContent)}, ${sqlEscape(seed.publicAnswer)},` +
        ` ${sqlEscape(slug)}, 1, ${createdAt}, 'resolved', 0, ${createdAt}, ${createdAt},` +
        ` ${createdAt}, ${createdAt}, ${createdAt});`,
    );
  });

  // Unanswered conversations for the inbox.
  PENDING.forEach((seed, index) => {
    const id = PUBLISHED.length + index + 1;
    const createdAt = now - (index + 1) * 3_600_000;
    out.push(
      `INSERT INTO questions (id, tracking_token, seeker_email, category, raw_title, raw_content,` +
        ` status, is_urgent, created_at, updated_at)` +
        ` VALUES (${id}, ${sqlEscape(`seed-${id.toString(36)}-pending`)},` +
        ` ${index === 0 ? sqlEscape("seeker@example.org") : "NULL"}, ${sqlEscape(seed.category)},` +
        ` ${sqlEscape(seed.title)}, ${sqlEscape(seed.content)}, 'new', ${seed.urgent ? 1 : 0},` +
        ` ${createdAt}, ${createdAt});`,
    );
  });

  PRAYERS.forEach((prayer, index) => {
    const createdAt = now - prayer.ageDays * day;
    out.push(
      // prayer_requests has no updated_at column — see migrations/0001_init.sql.
      `INSERT INTO prayer_requests (title, content, prayed_count, is_hidden, created_at)` +
        ` VALUES (${sqlEscape(prayer.title)}, ${sqlEscape(prayer.content)}, ${prayer.count}, 0,` +
        ` ${createdAt});`,
    );
  });

  return out;
}

function main() {
  const sql = statements().join("\n");
  console.log(`Seeding local D1 database "${DATABASE}"…`);
  console.log(
    `  ${PUBLISHED.length} published answers, ${PENDING.length} awaiting reply, ${PRAYERS.length} prayer requests`,
  );

  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DATABASE, "--local", `--command=${sql}`, "--json"],
    { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
  );

  console.log("\nDone. The first administrator is created on first sign-in from:");
  console.log("  ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD  (see .dev.vars.example)");
}

main();
