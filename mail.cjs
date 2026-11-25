function configured(){return !!(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD&&process.env.SMTP_FROM&&process.env.PUBLIC_URL);}
async function send(email,token,purpose,role){
 if(!configured())throw Error('Email is not configured.');
 const origin=new URL(process.env.PUBLIC_URL);if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('Invalid PUBLIC_URL');
 const actions={login:'Your admin sign-in code',verify:'Verify your email',reset:'Reset your password',invite:'Set up your garage account'};
 const link=`${origin.origin}/${role==='client'?'account':'admin'}#${purpose}?token=${token}`;
 const transporter=require('nodemailer').createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT)||587,secure:process.env.SMTP_SECURE==='true',requireTLS:process.env.SMTP_SECURE!=='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},connectionTimeout:15000,socketTimeout:20000});
 await transporter.sendMail({from:process.env.SMTP_FROM,to:email,subject:`${actions[purpose]} | Luzio Garage Trading`,text:purpose==='login'?`Your Luzio Garage Trading admin sign-in code is: ${token}\n\nExpires in 10 minutes and can be used once. Do not share this code. If you did not sign in, change your password.`:`${actions[purpose]} for Luzio Garage Trading.\n\n${link}\n\nThis link can be used once and expires in ${purpose==='verify'?'24 hours':'30 minutes'}. If you did not request this, ignore this email.`});
}
module.exports={configured,send};
