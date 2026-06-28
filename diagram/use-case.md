# Use Case Diagram

Actors and what they can do. Modeled as a flowchart (Mermaid has no native use-case type):
stadium-shaped nodes are use cases, `<<include>>`/`<<extend>>` are labeled dotted edges.

```mermaid
flowchart LR
  User(["👤 User"])
  OS(["💻 Operating System"])
  Math(["∑ Math Renderer"])

  subgraph App["pretty-markdown"]
    direction TB

    subgraph Tabs["Documents & Tabs"]
      UC_Open(["Open document"])
      UC_NewTab(["Open in new tab"])
      UC_Switch(["Switch tab"])
      UC_Close(["Close tab"])
      UC_Reorder(["Reorder tabs"])
      UC_Restore(["Restore previous session"])
    end

    subgraph Reading["Reading"]
      UC_Read(["Read document (reader mode)"])
      UC_Find(["Find in page"])
      UC_Theme(["Adjust font size / theme"])
    end

    subgraph Editing["Editing"]
      UC_Edit(["Edit markdown (live preview)"])
      UC_Toggle(["Toggle reader/edit mode"])
      UC_Save(["Save document"])
      UC_Macros(["Define custom macros (preamble)"])
    end

    UC_Math(["Render LaTeX math"])
    UC_Watch(["Reload on external change"])
  end

  %% User interactions
  User --- UC_Open
  User --- UC_NewTab
  User --- UC_Switch
  User --- UC_Close
  User --- UC_Reorder
  User --- UC_Read
  User --- UC_Find
  User --- UC_Theme
  User --- UC_Edit
  User --- UC_Toggle
  User --- UC_Save
  User --- UC_Macros

  %% Relationships
  UC_Open -. include .-> UC_NewTab
  UC_Read -. include .-> UC_Math
  UC_Edit -. include .-> UC_Math
  UC_Macros -. extend .-> UC_Math

  %% System actors
  UC_Math --- Math
  UC_Open --- OS
  UC_Save --- OS
  UC_Restore --- OS
  OS --- UC_Watch
  UC_Watch -. extend .-> UC_Read

  classDef actor fill:#e8f0fe,stroke:#4285f4,stroke-width:2px;
  class User,OS,Math actor;
```
