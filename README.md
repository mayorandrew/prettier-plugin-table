<div align="center">

# Prettier Plugin Table

Align columns in tables in typescript source files with prettier!

</div>

## Example

```typescript
// prettier-table
const v = [
  ["abc", "c"   , "ghijk"],
  [4    , 54    , 123    ],
  [71   , 800000, 9      ],
];

// prettier-table
callFn(
    ["abc", "c"   , "ghijk"],
    [4    , 54    , 123    ],
    [71   , 800000, 9      ],
);
```

## Installation

First, install the package:
```bash
npm install --save-dev prettier-plugin-table
```

Then adjust your prettier configuration:
```json
{
  "plugins": ["prettier-plugin-table"]
}
```

## Usage

The plugin supports formatting arrays of arrays and array function arguments as tables.

The behavior is controlled manually. By default, nothing is aligned. To align a table, put a line comment `// prettier-table` above it.

```typescript
// prettier-table
const v = [
    ["abc", "c"   , "ghijk"],
    [4    , 54    , 123    ],
    [71   , 800000, 9      ],
];
```

or

```typescript
// prettier-table
callFn(
    ["abc", "c"   , "ghijk"],
    [4    , 54    , 123    ],
    [71   , 800000, 9      ],
);
```

The columns are be aligned to the most wide element in each column.

The content of each row will take only a single line regardless of other prettier options and constraints, it may also surpass the `printWidth` setting for that reason.

Users of the plugin are advised to keep the tables small and readable.

## License

MIT
