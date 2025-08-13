import DOM from "phoenix_live_view/dom"
import DOMPatch from "phoenix_live_view/dom_patch"

describe("Performance Benchmarks", () => {
  let mockLiveSocket, mockView

  beforeEach(() => {
    mockLiveSocket = {
      binding: (attr) => `phx-${attr}`,
      time: (label, fn) => {
        const start = performance.now()
        const result = fn()
        const end = performance.now()
        return result
      },
      getActiveElement: () => null,
      isDebugEnabled: () => false,
      owner: (el, callback) => callback(mockView),
      destroyViewByEl: () => {},
      transitionRemoves: () => {},
      requestDOMUpdate: (fn) => fn(),
      silenceEvents: (fn) => fn(),
      unload: () => {}
    }

    mockView = {
      liveSocket: mockLiveSocket,
      root: { id: "root-1" },
      id: "view-1",
      ownsElement: () => true
    }
  })

  function createLargeDOM(elementCount = 100) {
    const container = document.createElement('div')
    container.id = 'benchmark-container'
    
    for (let i = 0; i < elementCount; i++) {
      const div = document.createElement('div')
      div.id = `item-${i}`
      div.className = `item class-${i % 10}`
      div.setAttribute('data-id', i)
      div.innerHTML = `<span>Item ${i}</span><button>Action</button>`
      container.appendChild(div)
    }
    
    return container
  }

  function createModifiedDOM(originalContainer) {
    const modified = originalContainer.cloneNode(true)
    const items = modified.querySelectorAll('.item')
    
    items.forEach((item, i) => {
      if (i % 3 === 0) {
        item.setAttribute('data-updated', 'true')
        item.querySelector('span').textContent = `Updated Item ${i}`
      }
      if (i % 5 === 0) {
        item.classList.add('highlighted')
      }
    })
    
    return modified
  }

  test("DOM.all() performance baseline", () => {
    const container = createLargeDOM(200)
    document.body.appendChild(container)
    
    const iterations = 10
    const selector = '.item'
    
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      DOM.all(container, selector)
    }
    const end = performance.now()
    
    const avgTime = (end - start) / iterations
    console.log(`DOM.all() average time: ${avgTime.toFixed(3)}ms`)
    
    document.body.removeChild(container)
    expect(avgTime).toBeLessThan(10) // Should be under 10ms
  })

  test("Attribute merging performance baseline", () => {
    const source = document.createElement('div')
    source.setAttribute('class', 'new-class')
    source.setAttribute('data-test', 'value')
    source.setAttribute('id', 'test-id')
    source.setAttribute('style', 'color: red;')
    
    const iterations = 1000
    const start = performance.now()
    
    for (let i = 0; i < iterations; i++) {
      const target = document.createElement('div')
      target.setAttribute('class', 'old-class')
      target.setAttribute('data-old', 'old-value')
      
      DOM.mergeAttrs(target, source)
    }
    
    const end = performance.now()
    const avgTime = (end - start) / iterations
    console.log(`Attribute merging average time: ${avgTime.toFixed(3)}ms`)
    
    expect(avgTime).toBeLessThan(1) // Should be under 1ms per operation
  })

  test("Morphdom operation performance baseline", () => {
    const originalContainer = createLargeDOM(50)
    const modifiedContainer = createModifiedDOM(originalContainer)
    
    document.body.appendChild(originalContainer)
    
    // Mock a proper focused element to avoid the null.type error
    const mockFocused = document.createElement('input')
    mockFocused.type = 'text'
    mockLiveSocket.getActiveElement = () => mockFocused
    
    const domPatch = new DOMPatch(
      mockView,
      originalContainer,
      'test-id',
      modifiedContainer.innerHTML,
      [], // streams
      null // targetCID
    )
    
    const start = performance.now()
    domPatch.perform(false)
    const end = performance.now()
    
    const operationTime = end - start
    console.log(`Morphdom operation time: ${operationTime.toFixed(3)}ms`)
    
    document.body.removeChild(originalContainer)
    expect(operationTime).toBeLessThan(100) // Should be under 100ms for 50 elements
  })

  test("Stream operations performance baseline", () => {
    const container = document.createElement('div')
    container.setAttribute('phx-update', 'stream')
    document.body.appendChild(container)
    
    // Create stream items
    for (let i = 0; i < 100; i++) {
      const item = document.createElement('div')
      item.id = `stream-item-${i}`
      item.setAttribute('phx-stream-ref', 'test-stream')
      container.appendChild(item)
    }
    
    const iterations = 10
    const start = performance.now()
    
    for (let i = 0; i < iterations; i++) {
      const children = Array.from(container.children)
      if (children.length > 0) {
        const item = children[0]
        container.appendChild(item) // Move to end
      }
    }
    
    const end = performance.now()
    const avgTime = (end - start) / iterations
    console.log(`Stream reordering average time: ${avgTime.toFixed(3)}ms`)
    
    document.body.removeChild(container)
    expect(avgTime).toBeLessThan(5) // Should be under 5ms per operation
  })
})