require("dotenv").config();
const express=require("express");

// multer for file uploads 

const multer=require("multer");

// PDFKit for generating PDFs. 

const PDFDocument=require("pdfkit");

// fs stands for "File System," and it's a built-in module in Node.js that provides an API for interacting with the file system.

const fs=require("fs");
const fsPromises=fs.promises;
const path=require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { log } = require("console");
const { rejects } = require("assert");

const app=express();

const port=process.env.PORT || 5000;


// config the multer
const upload=multer({dest:"upload/"});

// express.json() is a middleware function in Express.js that parses incoming requests with JSON payloads. 
// The limit option specifies the maximum size of the incoming JSON payload that the server will accept

app.use(express.json({limit:"10mb"}));

// initialize the gemini api
const genAl=new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

//  is a middleware function in Express.js that serves static files from a specified directory
app.use(express.static("public"));

// route

// analyze
// we can access what user is uploading
app.post('/analyze', upload.single("image"), async (req, res) => {
    try{
        if(!req.file){
            return res.status(400).json({error:"Please upload image"})
        }
        const imagePath=req.file.path;
        const imageData=await fsPromises.readFile(imagePath,{
            encoding:"base64",
        });
        // use the gemini to analyze the image
        const model=genAl.getGenerativeModel({
            model:'gemini-1.5-flash',
        });
        const results=await model.generateContent([
            "Analyze this plant image and provide detailed analysis of its species , health , and care recommendations , its characteristics , care instructions , and any interesting facts . Please provide response in plain text without using any markdown formatting",
            {
                inlineData:{
                    mimeType:req.file.mimetype,
                    data:imageData,
                },
            },
        ]);
        const plantInfo=results.response.text();
        // remove the uploaded image
        await fsPromises.unlink(imagePath);
        // send the response 
        res.json({ result: plantInfo, image: `data:${req.file.mimetype};base64,${imageData}` });

    }catch(error){
        res.status(500).json({error:error.message});
    };
});




// download pdf
app.post('/download', express.json(), async (req, res) => {
    const { result, image } = req.body;
    try {
        // Ensure the reports dir exists
        const reportsDir = path.join(__dirname, "reports");
        await fsPromises.mkdir(reportsDir, { recursive: true });

        // Generate PDF
        const filename = `plant_analysis_report_${Date.now()}.pdf`;
        const filePath = path.join(reportsDir, filename);
        const writeStream = fs.createWriteStream(filePath);
        const doc = new PDFDocument({ size: 'A4', margin: 50 });

        // Pipe the PDF to the write stream
        doc.pipe(writeStream);

        // Title
        doc.fontSize(26).font('Helvetica-Bold').text("Plant Analysis Report", {
            align: "center"
        });
        doc.moveDown();

        // Date
        doc.fontSize(12).font('Helvetica-Oblique').text(`Date: ${new Date().toLocaleDateString()}`, {
            align: "center"
        });
        doc.moveDown();

        // Result text
        doc.fontSize(14).font('Helvetica').text(result, {
            align: "left",
            lineGap: 4 // Space between lines
        });

        // Insert image if provided
        if (image) {
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, "base64");
            doc.moveDown();
            doc.image(buffer, {
                fit: [500, 300],
                align: "center",
                valign: "center"
            });
        }

        // Finalize PDF file
        doc.end();

        // Wait for the PDF to be created
        await new Promise((resolve, reject) => {
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
        });

        // Download the PDF
        res.download(filePath, (err) => {
            if (err) {
                res.status(500).json({ error: "Error downloading the PDF report" });
            }
            fsPromises.unlink(filePath);
        });
    } catch (error) {
        console.log("Error generating PDF report:", error);
        res.status(500).json({ error: "An error occurred while generating the PDF report" });
    }
});

// start the server
app.listen(port,()=>{
    console.log(`Listening on port ${port}`);
    
})








