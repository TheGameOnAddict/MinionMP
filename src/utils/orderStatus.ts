/**
 * Derives a human-readable order status from its constituent line item statuses,
 * while respecting any manually-set order_status flags stored in the Excel file.
 */
export function computeOrderStatus(items: any[], rawOrderStatus?: string): string {
    // Manually-set flags take priority
    if (rawOrderStatus === 'Needs Attention') return 'Needs Attention'
    if (rawOrderStatus === 'Edit Request') return 'Edit Request'
    if (rawOrderStatus === 'Ready') return 'Ready'
    if (rawOrderStatus === 'On Order') return 'On Order'
    if (rawOrderStatus === 'Processing') return 'Processing'
    if (rawOrderStatus === 'Fulfilled') return 'Fulfilled'
    if (rawOrderStatus === 'Canceled') return 'Canceled'
    if (rawOrderStatus === 'Complete') return 'Complete'

    if (!items || items.length === 0) return 'New'
    const statuses = items.map((i: any) => i.status)

    if (statuses.some((s: string) => s === 'Edit Request')) return 'Edit Request'

    const allCanceled = statuses.every((s: string) => s === 'Canceled')
    if (allCanceled) return 'Canceled'

    const allFulfilled = statuses.every((s: string) => s === 'Fulfilled')
    if (allFulfilled) return 'Fulfilled'

    const allComplete = statuses.every((s: string) => s === 'Fulfilled' || s === 'Canceled')
    if (allComplete) return 'Complete'

    // If any line has moved past New, the order is in progress
    const allNew = statuses.every((s: string) => s === 'New')
    if (!allNew) return 'Processing'

    return 'New'
}
