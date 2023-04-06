async function fetchViaProxy(url, options) {
  try {
    const proxyUrl = "https://corsproxy.io/?";
    const targetUrl = url;
    const proxiedUrl = proxyUrl + encodeURIComponent(targetUrl);

    const response = await fetch(proxiedUrl, options);
    return response;
  } catch (error) {
    console.error(error);
  }
}

async function fetchPdf(url, useProxy) {
  try {
    const options = {
      method: "GET",
      headers: {
        "Content-Type": "application/pdf",
      },
    };

    const response = useProxy
      ? await fetchViaProxy(url, options)
      : await fetch(url, options);

    const pdfData = await response.arrayBuffer();
    return pdfData;
  } catch (error) {
    console.error(error);
  }
}

async function getPDFText(pdfData) {
  let content = [];

  // Load the PDF file
  const pdf = await pdfjsLib.getDocument(pdfData).promise;

  // Get the text content of each page

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const pageTextContent = await page.getTextContent();
    const text = pageTextContent.items.map((item) => item.str).join("");

    content.push({ text, page: i });
  }
  return content;
}

function coursesPresent(text, courses) {
  const present = [];
  courses.forEach((course) => {
    if (text.includes(course)) present.push(course);
  });
  return present;
}

const API_KEY = "sk-407sAhG3VxDP1Y4PWN6iT" + "3BlbkFJENlAha" + "tLpKTBV6kLaKlu";

const format = `{
    "date": date object,
    "startTime": date object,
    "endTime": date object,
    "code":String
  }`;

// let logs = "";
// function updateLogs(log) {
//   logs = "<p>"+log + "</p>" + logs;
//   document.getElementById("logs").innerHTML = logs;
// }

let logs = "";
let errorOccured = false;

function updateLogs(log) {
  logs = "<p>" + log + "</p>" + logs;
  const logsArray = logs.split("</p>").slice(0, -1); // Split logs string into an array of messages and remove the last empty element
  const last10Logs = logsArray.slice(0, 5).join("</p>") + "</p>"; // Get the last 10 logs and join them back into a string
  document.getElementById("logs").innerHTML = last10Logs;
}

const courses = [
  // "STAT150",
  // "MGMT130",
  // "COSC261",
  // "COSC161",
  // "RELT207",
  // "MATH121",
];

updateLogs("App started...");

async function getTimetableJson(pdfTextContent, courses) {
  const timetableJson = [];
  let currentPage = 0;

  const promises = [];
  for (const page of pdfTextContent) {
    const pageText = page.text;
    currentPage = page.page;
    const presentCourses = coursesPresent(pageText, courses);

    const prompt = makePrompt(presentCourses, pageText);
    if (prompt) {
      try {
        console.log(
          presentCourses,
          " found on page",
          page.page,
          " fetching..."
        );
        updateLogs(
          `${presentCourses.join(",")} found on page ${
            page.page
          }. Fetching details...`
        );
        const response = await getGPTResponse(prompt);
        if (response.ok) {
          updateLogs(`Response received for page ${page.page}. loading...`);
        }
        console.log("response received for page", page.page);

        const json = JSON.parse(response.choices[0].message.content);

        //add page number to each course
        json.forEach((course) => {
          course.page = currentPage;
        });

        timetableJson.push(...json);
      } catch (e) {
        updateLogs(
          `An error occured while fetching the courses data for page ${page.page}`
        );
        console.log("Error while fetching the courses data", e);
      }
    } else {
      //updateLogs(`No courses found on page ${page.page}`);
      console.log("no courses in page", page.page);
    }
  }

  return timetableJson;
}

async function getGPTResponse(prompt) {
  const url = "https://api.openai.com/v1/chat/completions";

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  };

  const data = {
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content: "You are a helpful Assistant",
      },
      { role: "user", content: `${prompt}` },
    ],
    temperature: 0.2,
  };

  //   console.log("fetching response", prompt);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(data),
    });
    // updateLogs("Some response received...");
    console.log("Some response received...");
    return await res.json();
  } catch (e) {
    errorOccured = true;
    updateLogs("Error while fetching response");
    console.log("Error while fetching response", e);
  }
}

function makePrompt(presentCourses, pageText) {
  if (presentCourses.length === 0) return;
  let instruction = `IMPORTANT: all dates in the format "MM/DD/YY HH:MM AM/PM" are incorrect and must be ignored .dates such as "Tue, 18-04-2023" are correct. return dates in this format. "NOTE: you must return json,no explanation, plain json only, no more at all, dont return multiple corses with same code, dont choose any date that is not included in the text, NO DUPLICATES ALLOWED" give me json Array of ${
    presentCourses.length
  } element(s) for the following course codes: "${presentCourses.join(
    ","
  )}" each as json object with the following format: "${format}", from this text:`;

  instruction += `"${pageText}".`;

  instruction +=
    "don't return multiple corses with same code, don't choose any date that is not included in the text, dont use dummy date";
  return instruction;
}

async function main() {
  //
  document.getElementById("loader").style.display = "block";
  try {
    const timetableUrl = "./timetable.pdf";
    updateLogs("Fetching timetable pdf...");
    console.log("fetching timetable pdf");
    const pdfData = await fetchPdf(timetableUrl, false);
    updateLogs("Fetching pdf text content...");
    console.log("fetching pdf text content");
    const pdfTextContent = await getPDFText(pdfData);
    updateLogs("Fetching timetable json...");
    console.log("fetching timetable json");

    const timetableJson = await getTimetableJson(pdfTextContent, courses);
    updateLogs("Displaying timetable...");
    console.log(timetableJson);
    displayEvents(timetableJson);
  } catch (e) {
    updateLogs("A connection error occured, please reload the page");
  }
  //show loader
  document.getElementById("loader").style.display = "none";
}

function displayEvents(events) {
  // Sort events by page, date, and start time
  events.sort(function (a, b) {
    if (a.page !== b.page) {
      return a.page - b.page;
    } else if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    } else {
      return a.startTime.localeCompare(b.startTime);
    }
  });

  // Create table element and header row
  var table = document.createElement("table");
  table.classList.add("event-table");
  var thead = table.createTHead();
  var headerRow = thead.insertRow();
  var headers = ["Date", "Start Time", "End Time", "Code", "Page"];
  for (var i = 0; i < headers.length; i++) {
    var headerCell = document.createElement("th");
    headerCell.textContent = headers[i];
    headerRow.appendChild(headerCell);
  }

  // Create table body and rows
  var tbody = document.createElement("tbody");
  for (var i = 0; i < events.length; i++) {
    var row = tbody.insertRow();
    row.classList.add("event-row");
    var dateCell = row.insertCell();
    dateCell.textContent = events[i].date;
    var startTimeCell = row.insertCell();
    startTimeCell.textContent = events[i].startTime;
    var endTimeCell = row.insertCell();
    endTimeCell.textContent = events[i].endTime;
    var codeCell = row.insertCell();
    codeCell.textContent = events[i].code;
    var pageCell = row.insertCell();
    pageCell.textContent = events[i].page;
  }

  // Add table to the page
  table.appendChild(tbody);

  setTimeout(() => {
    document.getElementById("try-again").style.display = "block";

    document.getElementById("logs").innerHTML =
      "<p>Process completed Successfully!</p>";

    if (errorOccured)
      document.getElementById("logs").innerHTML =
        "<p>Process completed with errors!</p>";
  }, 2500);

  document.body.appendChild(table);
}

// Add an event listener to the "Add" button
const addButton = document.getElementById("add-button");
const submitButton = document.getElementById("submit-button");
submitButton.addEventListener("click", function (e) {
  e.preventDefault();
  const courseCodeInput = document.getElementById("course-code");
  const courseCode = courseCodeInput.value
    .trim()
    .toUpperCase()
    .replace(/\s/g, "");
  if (courseCode) {
    addButton.click();
  }
  main();

  //hide the form
  document.getElementById("form").style.display = "none";
  //hide ul
  document.getElementById("course-list").style.display = "none";
});
addButton.addEventListener("click", function (e) {
  e.preventDefault();
  const courseCodeInput = document.getElementById("course-code");
  const courseCode = courseCodeInput.value
    .trim()
    .toUpperCase()
    .replace(/\s/g, "");

  if (courseCode.length === 7) {
    if (courses.includes(courseCode)) {
      updateLogs("Course already added!");
      return;
    }
    courses.push(courseCode);
    const courseList = document.getElementById("course-list");
    const newCourseListItem = document.createElement("li");
    newCourseListItem.textContent = courseCode;
    courseList.appendChild(newCourseListItem);
    courseCodeInput.value = "";
    document.getElementById("submit-button").classList.remove("disabled");
  } else {
    updateLogs("Invalid course code entered, must be 7 characters long!");
  }
});
