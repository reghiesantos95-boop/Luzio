const MAX_INPUT_PIXELS=120000000;
const unavailable=cause=>Object.assign(new Error('Image processor is unavailable on this server. Run npm ci in the project folder, then restart npm run dev. [IMAGE_PROCESSOR_UNAVAILABLE]'),{code:'IMAGE_PROCESSOR_UNAVAILABLE',cause});
function createImageProcessor(load=()=>require('sharp')){
 const getSharp=()=>{try{return load();}catch(error){throw unavailable(error);}};
 async function compressImage(bytes){
  const sharp=getSharp();
  try{return await sharp(bytes,{limitInputPixels:MAX_INPUT_PIXELS,animated:false,sequentialRead:true}).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:82,effort:4}).toBuffer();}
  catch(error){
   if(/pixel limit|exceeds.*pixels/i.test(error.message))throw Object.assign(new Error('Photo exceeds 120 megapixels. Resize its width and height before uploading. [IMAGE_TOO_LARGE]'),{code:'IMAGE_TOO_LARGE',cause:error});
   if(/unsupported image|corrupt|premature|invalid|jpeg|png|webp|vips|input buffer/i.test(error.message))throw Object.assign(new Error('This photo could not be decoded. Export it again as PNG, JPEG, or WebP and retry. [IMAGE_DECODE_FAILED]'),{code:'IMAGE_DECODE_FAILED',cause:error});
   throw Object.assign(new Error('The server could not process this photo. Check the server terminal for the upload reference. [IMAGE_PROCESSING_FAILED]'),{code:'IMAGE_PROCESSING_FAILED',cause:error});
  }
 }
 async function healthCheck(){const sharp=getSharp();try{await sharp({create:{width:1,height:1,channels:3,background:'#ffffff'}}).webp().toBuffer();return {ok:true,diagnosticsVersion:2,node:process.version,platform:process.platform,arch:process.arch,sharp:sharp.versions.sharp,vips:sharp.versions.vips,maxMegapixels:120};}catch(error){throw unavailable(error);}}
 return {compressImage,healthCheck};
}
module.exports={...createImageProcessor(),createImageProcessor,MAX_INPUT_PIXELS};
