// unit checks for the end-of-turn word rules and the segment joiner
const {open} = require('./h');
(async () => { const {b, p, errs} = await open();
  const r = await p.evaluate(() => {
    const more = ['I like it because', 'My favorite food is', 'I went to the', 'I live in', 'and', 'I think', 'um', 'I want', 'The best thing was', 'I like football,', 'my', 'with my'];
    const done = ['Yes, it is.', 'Yes, I am', 'Yes, they are', 'I think so', "I don't think so", 'I like football.', 'Here you are', 'Yes I can', 'Really', 'I like that', 'Me too', 'It was fun', 'yes', 'I have a cat'];
    const bad = [...more.filter(x => !soundsUnfinished(x)).map(x => 'should wait: ' + x), ...done.filter(x => soundsUnfinished(x)).map(x => 'should end: ' + x)];
    const j = [joinSegs(['I like football because.', 'It is fun.']), joinSegs(['I play with.', 'Ahmed every day.']), joinSegs(['Yes.', 'I like it.']), joinSegs(['My favorite is.', 'Pizza.'])];
    return {bad, j};
  });
  console.log(JSON.stringify(r));
  const ok = !r.bad.length && r.j[0] === 'I like football because it is fun.' && r.j[1] === 'I play with Ahmed every day.' && r.j[2] === 'Yes. I like it.' && r.j[3] === 'My favorite is Pizza.';
  console.log(ok ? 'PASS' : 'FAIL', errs); await b.close(); })();
