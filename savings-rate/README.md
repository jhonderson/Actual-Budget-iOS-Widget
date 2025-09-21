# Savings Rate Widget

It displays the monthly savings rate. The savings rate of a month is calculated as the total amount of money allocated to a list of categories (known as savings categories) divided by the total income for that month.

## 📷 Widget Preview

![Savings Rate Light Preview](./Savings_Rate_Light_Preview.png)

![Savings Rate Dark Preview](./Savings_Rate_Dark_Preview.png)

## 🚀 Setup

The code is in [actual-savings-rate-widget.js](./actual-savings-rate-widget.js), the setup steps are the same as the [Actual Budget widget](../README.md), but make sure to add your custom savings categories here:

```javascript
const targetCategories = [
  '💰 Savings',
  '👴 401K',
  '🚨 Emergency Fund',
]
```
