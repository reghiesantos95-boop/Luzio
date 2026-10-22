const sharp=require('sharp');
async function compressImage(bytes){
 return sharp(bytes,{limitInputPixels:40000000,animated:false}).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:82,effort:4}).toBuffer();
}
module.exports={compressImage};
