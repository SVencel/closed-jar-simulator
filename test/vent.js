require('../src/species.js'); require('../src/model.js');
const M=Terra.model, K=M.K;
for (const [kE,kV] of [[0.4,2],[3,20],[6,30],[6,60],[10,40]]) {
  K.kEvap=kE; K.kVent=kV;
  const out=[];
  for (const leak of [0.25,0.5,1]) {
    const j=M.createJar({drainWater:90, plants:[{sp:'generic',start:6}]}); M.advance(j,24*20,{diag:false});
    const w0=j.s.W+j.s.Wd; j.params.leak=leak; let rh=0;
    for(let d=0;d<5;d++){M.advance(j,24,{diag:false}); rh+=j.d.rh/5;}
    out.push('leak '+leak+': '+((w0-j.s.W-j.s.Wd)/5).toFixed(2)+' ml/day RH '+rh.toFixed(2));
  }
  console.log('kEvap',kE,'kVent',kV,'|',out.join(' | '));
}
