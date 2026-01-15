//require("./config/env");

require("dotenv").config();

const app = require("./app");

const PORT = process.env.PORT || 8080;

app.listen(PORT , () => {
    console.log(`ERP portal API running on port ${PORT}`);
});