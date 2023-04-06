import { readdir, stat, readFile } from 'fs/promises';
import { extname, join } from 'path';
import cheerio from 'cheerio';
import fetch from 'node-fetch';


async function handleNetlifyForms(forms, constants, inputs) {
    let netlifyApiToken = inputs?.netlify_key ? inputs?.netlify_key : constants.NETLIFY_API_TOKEN;
    let netlifyApiHost = 'https://' + constants.NETLIFY_API_HOST + '/api/v1/';
    let siteID = constants.SITE_ID;


    // Let paths of api 
    let getFormsPath = `sites/${siteID}/forms/`; // Do a GET request
    let getHooksPath = `hooks?${new URLSearchParams({
        site_id: siteID
    })}`; // Do a GET request
    let createHooksPath = `hooks/`; // Do a POST request 

    //Get all netlify forms 
    let allForms = await fetch(netlifyApiHost + getFormsPath, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${netlifyApiToken}`
        }
    }).then((res) => {
        return res.json();
    });

    // Get all hooks 
    let allHooks = await fetch(netlifyApiHost + getHooksPath, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${netlifyApiToken}`
        }
    }).then((res) => {
        return res.json();
    });

    console.log("This all forms DOM", forms);
    console.log("This all forms", allForms);
    console.log("This all Hooks", allHooks);

    // For each form get current hooks 
    for (const element of allForms){
        let currentHooks = allHooks.filter(el => el["form_name"] === element.name);

        // Get data DOM Forms
        let currentDomForm = forms.find(el => el.name === element.name);

        // Logs
        console.log("Current Hooks", currentHooks);
        console.log("Current DOM Form", currentDomForm);

        // If hooks with the existing mail in currentDomForm all ready existing do nothing 
        if (currentHooks && currentHooks.some(hook => hook?.data?.email === currentDomForm?.to)) {
            // return async 
            console.log("The hook is all ready existing !!");
        } else {
            console.log("Create the new hook");
            // else create the New Hooks 

            /*                 
            DATA Form to send 
                {
                "site_id": "0d3a9d2f-ef94-4380-93df-27ee400e2048",
                "form_id": "5235a7a00d61eec2d6001302",
                "type": "email",
                "event": "submission_created",
                "data": { "email": "test@example.com" }
              } */
            let newHookData = {
                "site_id": siteID,
                "form_id": element.id,
                "type": "email",
                "event": "submission_created",
                "data": { "email": currentDomForm.to }
            };

            let newHook = await fetch(netlifyApiHost + createHooksPath, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${netlifyApiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newHookData)
            }).then((el) => el.json()).catch(error => console.error(error));

            console.log("NEW HOOK", newHook);
        }
    }
}

async function findHtmlFiles(path) {
    const files = await readdir(path);

    const htmlFiles = [];
    const directories = [];

    for (const file of files) {
        const filePath = join(path, file);
        const fileStat = await stat(filePath);

        if (fileStat.isDirectory()) {
            directories.push(filePath);
        } else if (extname(file) === '.html') {
            htmlFiles.push(filePath);
        }
    }

    for (const directory of directories) {
        const directoryHtmlFiles = await findHtmlFiles(directory);
        htmlFiles.push(...directoryHtmlFiles);
    }

    return htmlFiles;
}

async function findAllForm(file) {
    // Read the file contents
    const contents = await readFile(file, 'utf8');

    // Parse the HTML contents with Cheerio
    const $ = cheerio.load(contents);

    // Get all forms with data-netlify attribute
    const forms = $('form[data-netlify]');

    // Initialize an empty array to store the results
    const results = [];

    // For each form with data-netlify attribute
    forms.each((index, form) => {
        // Get the form ID
        const id = $(form).attr('id');

        // Get the name of the form 
        const name = $(form).attr('name');

        // Get the form destination (data-netlify-to attribute)
        const to = $(form).attr('data-netlify-to');

        // Get the path to the file relative to the project root
        const path = join(process.cwd(), file);

        // Add the results to the array
        results.push({ id, name, to, path });
    });

    // Return the results object
    return results;
}

export const onSuccess = async function ({ constants, utils, inputs }) {
    try {
        console.log(constants)
        let allHtmlFiles = await findHtmlFiles(constants.PUBLISH_DIR).catch(error => console.error(error));
        console.log("All Html files", allHtmlFiles);
        console.log("You get " + allHtmlFiles.length + " files");

        let allForms = await Promise.all(allHtmlFiles.map(findAllForm));
        allForms = allForms.filter(el => el.length > 0).flat();

        let forms = await handleNetlifyForms(allForms, constants, inputs);
    } catch (error) {
        console.error(error);
        utils.build.failPluginBuild("YOUR_FAILURE_MESSAGE", { error });
    }
}