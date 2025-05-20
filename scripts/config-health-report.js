import { readdirSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const directoryPath = join(__dirname, '../generated/v4/');
const inspectionList = [
    "fingerprintingBattery",
    "gpc",
    "referrer",
    "navigatorInterface",
    "elementHiding",
    "apiManipulation",
    "cookie",
    "duckPlayer"
];

// Read all JSON files in the directory
const files = readdirSync(directoryPath).filter(file => extname(file) === '.json');

// Aggregated summary variables
let totalExceptionsAcrossFiles = 0;
let totalInspectionListExceptions = 0;
let enabledFeatureSet = new Set();
const aggregatedCounts = {};
const aggregatedFileSizeCounts = {};

for (const file of files) {
    if (file.match(/extension-[a-z0-9]+-config/)) {
        continue;
    }
    const filePath = join(directoryPath, file);
    const data = JSON.parse(readFileSync(filePath, 'utf8'));

    // Step 1: Extract features
    const features = data.features;

    // Step 2: Count total exceptions
    let totalExceptions = 0;
    const counts = {};
    const fileSizeCounts = {};

    for (const [feature, details] of Object.entries(features)) {
        const skipStates = ['disabled'];
        if (skipStates.includes(details.state)) {
            continue; // Skip features that match any of the specified states
        }
        const count = Array.isArray(details.exceptions) ? details.exceptions.length : 0;
        counts[feature] = count;
        totalExceptions += count;

        // Aggregate counts across files
        aggregatedCounts[feature] = (aggregatedCounts[feature] || 0) + count;
        enabledFeatureSet.add(feature);

        // Serialize each feature and calculate its size
        const serializedFeature = JSON.stringify(details);
        const featureSize = Buffer.byteLength(serializedFeature, 'utf8');
        fileSizeCounts[feature] = featureSize;
        aggregatedFileSizeCounts[feature] = (aggregatedFileSizeCounts[feature] || 0) + featureSize;
    }

    // Step 3: Calculate enabled features
    let enabledFeaturesCount = 0;
    for (const [feature, details] of Object.entries(features)) {
        if (details.state === 'enabled') {
            enabledFeaturesCount++;
        }
    }

    console.log(`\nFile: ${file}`);
    console.log(`Number of enabled features: ${enabledFeaturesCount}`);

    const results = [];
    for (const [feature, count] of Object.entries(counts)) {
        const percentage = totalExceptions === 0 ? 0 : ((count / totalExceptions) * 100).toFixed(2);
        if (percentage > 0) {
            results.push({ feature, count, percentage: parseFloat(percentage) });
        }
    }

    // Sort by percentage in descending order
    results.sort((a, b) => b.percentage - a.percentage);

    // Print results
    console.log(`Total exceptions: ${totalExceptions}`);
    console.log("Breakdown by feature (sorted by %):");
    for (const { feature, count, percentage } of results) {
        console.log(`${feature}: ${count} exception(s), ${percentage}%`);
    }

    // Calculate and print the total exceptions and percentage for the inspection list
    let inspectionListTotal = 0;
    for (const feature of inspectionList) {
        inspectionListTotal += counts[feature] || 0;
    }
    const inspectionListPercentage = totalExceptions === 0 ? 0 : ((inspectionListTotal / totalExceptions) * 100).toFixed(2);

    console.log(`\nTotal exceptions for inspection list: ${inspectionListTotal}`);
    console.log(`Percentage of total exceptions for inspection list: ${inspectionListPercentage}%`);

    // Aggregate totals across files
    totalExceptionsAcrossFiles += totalExceptions;
    totalInspectionListExceptions += inspectionListTotal;
}

// Final summary across all files
console.log("\n=== Summary Across All Files ===");
console.log(`Total exceptions across all files: ${totalExceptionsAcrossFiles}`);
console.log(`Total enabled features across all files: ${enabledFeatureSet.size}`);

const summaryResults = [];
for (const [feature, count] of Object.entries(aggregatedCounts)) {
    const percentage = totalExceptionsAcrossFiles === 0 ? 0 : ((count / totalExceptionsAcrossFiles) * 100).toFixed(2);
    if (percentage > 0) {
        summaryResults.push({ feature, count, percentage: parseFloat(percentage) });
    }
}

// Sort by percentage in descending order
summaryResults.sort((a, b) => b.percentage - a.percentage);

console.log("Breakdown by feature (sorted by %):");
for (const { feature, count, percentage } of summaryResults) {
    console.log(`${feature}: ${count} exception(s), ${percentage}%`);
}

const inspectionListPercentageAcrossFiles = totalExceptionsAcrossFiles === 0
    ? 0
    : ((totalInspectionListExceptions / totalExceptionsAcrossFiles) * 100).toFixed(2);

console.log(`\nTotal exceptions for inspection list across all files: ${totalInspectionListExceptions}`);
console.log(`Percentage of total exceptions for inspection list across all files: ${inspectionListPercentageAcrossFiles}%`);

// Print the size of each feature across all files
console.log("\n=== Size of Each Feature Across All Files (Sorted by Total Size) ===");
const sortedSizes = Object.entries(aggregatedFileSizeCounts)
    .sort((a, b) => b[1] - a[1]);

let otherFeaturesSize = 0; // Initialize to accumulate sizes of smaller features

function sizeInKB(size) {
    return (size / 1024).toFixed(2); // Convert bytes to kilobytes with 2 decimal places
}

for (const [feature, size] of sortedSizes) {
    if (size < (5*1024)) {
        otherFeaturesSize += size;
        continue;
    }
    console.log(`${feature}: ${sizeInKB(size)} KB`);
}

if (otherFeaturesSize > 0) {
    console.log(`Remaining features: ${sizeInKB(otherFeaturesSize)} KB`);
}
